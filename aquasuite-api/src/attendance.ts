import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";

type AttendanceStatus = "unknown" | "present" | "absent" | "late" | "makeup";

function key(locationId: string, date: string) {
  return `${locationId}::${date}`;
}

export function registerAttendanceRoutes(app: FastifyInstance, db: Pool, wsBus: WsBus) {
  // GET roster + entries + latest status per entry
  app.get("/rosters", { preHandler: app.authRequired }, async (req, reply) => {
    const { locationId, date } = req.query as { locationId?: string; date?: string };
    if (!locationId || !date) return reply.code(400).send({ error: "locationId and date are required" });

    const rosterRes = await db.query(
      `SELECT * FROM rosters WHERE location_id = $1 AND roster_date = $2::date LIMIT 1`,
      [locationId, date]
    );

    // If no roster yet, return empty structure so UI can still render
    if (rosterRes.rowCount === 0) {
      return {
        roster: null,
        entries: [],
      };
    }

    const roster = rosterRes.rows[0];

    const entriesRes = await db.query(
      `
      SELECT
        e.*,
        al.marked_status as attendance_status,
        al.marked_at as attendance_marked_at,
        al.marked_by_mode as attendance_marked_by_mode,
        al.note as attendance_note
      FROM roster_entries e
      LEFT JOIN attendance_latest al
        ON al.roster_entry_id = e.id
      WHERE e.roster_id = $1
      ORDER BY e.class_time NULLS LAST, e.swimmer_name ASC
      `,
      [roster.id]
    );

    return {
      roster,
      entries: entriesRes.rows.map((r) => ({
        ...r,
        attendance_status: (r.attendance_status ?? "unknown") as AttendanceStatus,
      })),
    };
  });

  // POST mark attendance (append-only events)
  app.post("/attendance/mark", { preHandler: app.authRequired }, async (req, reply) => {
    const body = req.body as {
      rosterEntryId?: string;
      status?: AttendanceStatus;
      note?: string;
      mode?: string; // "deck" | "desk" | "vd"
      locationId?: string; // required for WS broadcast
      date?: string; // YYYY-MM-DD required for WS broadcast
    };

    const { rosterEntryId, status, note, mode = "deck", locationId, date } = body;
    if (!rosterEntryId || !status) return reply.code(400).send({ error: "rosterEntryId and status are required" });

    // req.user is set by your auth middleware
    // If your auth uses a different shape, adjust this line only.
    const userId = (req as any).user?.id ?? null;

    const ins = await db.query(
      `
      INSERT INTO attendance_events (roster_entry_id, marked_status, marked_by_user_id, marked_by_mode, note)
      VALUES ($1, $2::attendance_status, $3, $4, $5)
      RETURNING id, roster_entry_id, marked_status, marked_by_user_id, marked_by_mode, note, marked_at
      `,
      [rosterEntryId, status, userId, mode, note ?? null]
    );

    const event = ins.rows[0];

    // Broadcast to anyone viewing same location/date
    if (locationId && date) {
      wsBus.broadcast(key(locationId, date), {
        type: "attendance.updated",
        payload: {
          rosterEntryId,
          status: event.marked_status,
          markedAt: event.marked_at,
          markedByUserId: event.marked_by_user_id,
          mode: event.marked_by_mode,
          note: event.note,
        },
      });
    }

    return { ok: true, event };
  });
}

/**
 * Tiny pub-sub bus for WebSocket connections
 */
export class WsBus {
  private channels = new Map<string, Set<any>>();

  subscribe(channelKey: string, socket: any) {
    if (!this.channels.has(channelKey)) this.channels.set(channelKey, new Set());
    this.channels.get(channelKey)!.add(socket);
  }

  unsubscribeAll(socket: any) {
    for (const set of this.channels.values()) set.delete(socket);
  }

  broadcast(channelKey: string, message: any) {
    const set = this.channels.get(channelKey);
    if (!set) return;
    for (const ws of set) {
      try {
        ws.send(JSON.stringify(message));
      } catch {
        // ignore broken sockets
      }
    }
  }
}
