\restrict 1GQgwcTzTANbGzFhmh2Rf2sWAxHlgGG5flA6BtVvJLKV5h8nnr5QlI82YTYd3Up

-- Dumped from database version 16.11 (Ubuntu 16.11-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.11 (Ubuntu 16.11-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: attendance_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.attendance_status AS ENUM (
    'unknown',
    'present',
    'absent',
    'late',
    'makeup'
);


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: acne_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acne_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid,
    lead_date date,
    full_name text,
    email text,
    phone text,
    source_upload_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_user_id uuid,
    action_type text NOT NULL,
    target_user_id uuid,
    location_id uuid,
    metadata_json jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: attendance_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    roster_entry_id uuid NOT NULL,
    marked_status public.attendance_status NOT NULL,
    marked_by_user_id uuid,
    marked_by_mode text DEFAULT 'deck'::text NOT NULL,
    note text,
    marked_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instructor_observations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_observations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid NOT NULL,
    staff_id uuid,
    instructor_name text,
    class_date date,
    class_time time without time zone,
    notes text,
    form_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: report_uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_uploads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid NOT NULL,
    report_type text NOT NULL,
    report_title text,
    detected_location_name text,
    detected_location_ids jsonb,
    date_ranges jsonb,
    sha256 text NOT NULL,
    stored_path text NOT NULL,
    uploaded_by_user_id uuid,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roster_uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roster_uploads (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    location_id uuid NOT NULL,
    uploaded_by_user_id uuid,
    original_filename text NOT NULL,
    content_type text,
    bytes integer,
    sha256 text,
    stored_path text NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    parse_status text DEFAULT 'pending'::text NOT NULL,
    parse_error text,
    parsed_at timestamp with time zone
);


--
-- Name: activity_feed; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.activity_feed AS
 SELECT ae.id,
    ae.marked_at AS created_at,
    'attendance'::text AS event_type,
    ae.roster_entry_id AS entity_id,
    NULL::uuid AS location_id,
    ae.marked_by_user_id AS actor_user_id,
    jsonb_build_object('status', ae.marked_status, 'note', ae.note) AS payload
   FROM public.attendance_events ae
UNION ALL
 SELECT ra.id,
    ra.created_at,
    'admin_action'::text AS event_type,
    ra.target_user_id AS entity_id,
    ra.location_id,
    ra.actor_user_id,
    ra.metadata_json AS payload
   FROM public.admin_actions ra
UNION ALL
 SELECT ru.id,
    ru.uploaded_at AS created_at,
    'roster_upload'::text AS event_type,
    ru.id AS entity_id,
    ru.location_id,
    ru.uploaded_by_user_id AS actor_user_id,
    jsonb_build_object('filename', ru.original_filename, 'bytes', ru.bytes) AS payload
   FROM public.roster_uploads ru
UNION ALL
 SELECT rpu.id,
    rpu.uploaded_at AS created_at,
    'report_upload'::text AS event_type,
    rpu.id AS entity_id,
    rpu.location_id,
    rpu.uploaded_by_user_id AS actor_user_id,
    jsonb_build_object('type', rpu.report_type, 'title', rpu.report_title) AS payload
   FROM public.report_uploads rpu
UNION ALL
 SELECT io.id,
    io.created_at,
    'observation'::text AS event_type,
    io.id AS entity_id,
    io.location_id,
    NULL::uuid AS actor_user_id,
    jsonb_build_object('instructor', io.instructor_name) AS payload
   FROM public.instructor_observations io;


--
-- Name: activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_user_id uuid,
    location_id uuid,
    entity_type text,
    entity_id uuid,
    action text NOT NULL,
    diff jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: aged_accounts_rows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aged_accounts_rows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    snapshot_id uuid,
    bucket text,
    amount numeric,
    total numeric
);


--
-- Name: aged_accounts_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aged_accounts_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid,
    report_date date,
    source_upload_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid,
    type text NOT NULL,
    severity text DEFAULT 'info'::text NOT NULL,
    entity_type text,
    entity_id uuid,
    message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    resolved_note text
);


--
-- Name: attendance_latest; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.attendance_latest AS
 SELECT DISTINCT ON (roster_entry_id) roster_entry_id,
    marked_status,
    marked_by_user_id,
    marked_by_mode,
    note,
    marked_at
   FROM public.attendance_events
  ORDER BY roster_entry_id, marked_at DESC;


--
-- Name: audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid,
    actor_user_id uuid,
    event_type text NOT NULL,
    entity_type text,
    entity_id uuid,
    payload_json jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: auth_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    event_type text NOT NULL,
    ip_address text,
    user_agent text,
    details jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: auth_rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_rate_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identifier text NOT NULL,
    attempts integer DEFAULT 1,
    locked_until timestamp with time zone,
    first_attempt_at timestamp with time zone DEFAULT now(),
    last_attempt_at timestamp with time zone DEFAULT now()
);


--
-- Name: billing_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid,
    contact_id uuid,
    child_external_id text,
    status text DEFAULT 'open'::text NOT NULL,
    priority text DEFAULT 'med'::text NOT NULL,
    assigned_to_user_id uuid,
    reason text,
    internal_notes text,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: class_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_instances (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    location_id uuid NOT NULL,
    upload_id uuid,
    class_date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone,
    class_name text NOT NULL,
    scheduled_instructor text,
    actual_instructor text,
    is_sub boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: client_intake_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_intake_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    intake_id uuid NOT NULL,
    staff_id uuid,
    action_type text NOT NULL,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: client_intakes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_intakes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text DEFAULT 'gmail_intake'::text NOT NULL,
    gmail_message_id text,
    received_at timestamp with time zone,
    raw_subject text,
    raw_body text,
    location_id uuid,
    location_name_raw text,
    client_name text,
    preferred_day text,
    preferred_time text,
    contact_phone text,
    contact_email text,
    instructor_primary text,
    instructor_secondary text,
    code text,
    score_goal integer,
    score_structure integer,
    score_connection integer,
    score_value integer,
    level text,
    ratio text,
    why text,
    enrollment_link text,
    status text DEFAULT 'new'::text NOT NULL,
    owner_staff_id uuid,
    next_follow_up_at timestamp with time zone,
    notes text,
    hubspot_contact_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    swimmer_name text,
    guardian_name text,
    requested_start_date date,
    source_detail text
);


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text,
    phone text,
    source_system text,
    source_external_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_group_members (
    group_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    added_by_user_id uuid,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    canonical_contact_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid,
    source text,
    full_name text,
    email text,
    phone text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: coverage_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coverage_overrides (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    location_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    granted_by_user_id uuid NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: day_closures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.day_closures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid NOT NULL,
    closed_date date NOT NULL,
    closed_by uuid,
    closed_at timestamp with time zone DEFAULT now() NOT NULL,
    reopened_by uuid,
    reopened_at timestamp with time zone
);


--
-- Name: drop_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drop_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid,
    drop_date date,
    swimmer_name text,
    reason text,
    source_upload_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: enrollment_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrollment_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid,
    event_date date,
    swimmer_name text,
    source_upload_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: entity_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    note text NOT NULL,
    is_internal boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: feature_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feature_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    enabled boolean DEFAULT false,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: gmail_oauth_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gmail_oauth_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text,
    access_token text NOT NULL,
    refresh_token text,
    scope text,
    token_type text,
    expires_at timestamp with time zone,
    last_history_id text,
    last_received_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: homebase_shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.homebase_shifts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid NOT NULL,
    homebase_shift_id text NOT NULL,
    homebase_staff_id text,
    staff_id uuid,
    start_at timestamp with time zone,
    end_at timestamp with time zone,
    role text,
    status text,
    is_open boolean DEFAULT false NOT NULL,
    raw jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: homebase_staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.homebase_staff (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid NOT NULL,
    homebase_id text NOT NULL,
    first_name text,
    last_name text,
    full_name text,
    email text,
    phone text,
    role text,
    is_active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instructor_observation_swimmers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_observation_swimmers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    observation_id uuid NOT NULL,
    swimmer_name text NOT NULL,
    scores jsonb,
    notes text
);


--
-- Name: instructor_retention_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_retention_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid NOT NULL,
    staff_id uuid,
    instructor_name text NOT NULL,
    starting_headcount integer,
    ending_headcount integer,
    retention_percent numeric,
    as_of_start date,
    as_of_end date,
    retained_start integer,
    retained_end integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: integration_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    location_id uuid,
    event_type text NOT NULL,
    status text NOT NULL,
    message text,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: integration_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_status (
    provider text NOT NULL,
    location_id uuid NOT NULL,
    last_synced_at timestamp with time zone,
    last_success_at timestamp with time zone,
    last_error text,
    meta jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: location_features; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_features (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid NOT NULL,
    announcer_enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    state text NOT NULL,
    timezone text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    features jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    email_tag text,
    hubspot_tag text,
    intake_enabled boolean DEFAULT true NOT NULL,
    announcer_enabled boolean DEFAULT false NOT NULL,
    location_key text,
    city_state text
);


--
-- Name: notification_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_reads (
    notification_id uuid NOT NULL,
    staff_id uuid NOT NULL,
    read_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid,
    type text NOT NULL,
    message text,
    payload_json jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone,
    channel text DEFAULT 'manager'::text,
    title text,
    body text,
    entity_type text,
    entity_id uuid,
    created_by_staff_id uuid
);


--
-- Name: reconciliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reconciliations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid,
    entity_type text NOT NULL,
    entity_key text NOT NULL,
    issue_type text NOT NULL,
    options jsonb,
    selected_option jsonb,
    resolved_by_user_id uuid,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: retention_rows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retention_rows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    snapshot_id uuid,
    instructor_name text,
    booked integer,
    retained integer,
    percent_this_cycle numeric,
    percent_change numeric
);


--
-- Name: retention_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retention_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid,
    report_date date,
    source_upload_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id smallint NOT NULL,
    key text NOT NULL,
    label text NOT NULL
);


--
-- Name: roster_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roster_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    roster_id uuid,
    class_time timestamp with time zone,
    class_name text,
    instructor_name text,
    customer_name text,
    customer_phone text,
    swimmer_name text NOT NULL,
    swimmer_external_id text,
    customer_external_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    location_id uuid,
    upload_id uuid,
    class_date date,
    start_time time without time zone,
    age_text text,
    program text,
    level text,
    scheduled_instructor text,
    actual_instructor text,
    is_sub boolean DEFAULT false NOT NULL,
    zone integer,
    attendance integer,
    attendance_auto_absent boolean DEFAULT false NOT NULL,
    attendance_at timestamp with time zone,
    attendance_marked_by_user_id uuid,
    flag_first_time boolean DEFAULT false NOT NULL,
    flag_makeup boolean DEFAULT false NOT NULL,
    flag_policy boolean DEFAULT false NOT NULL,
    flag_owes boolean DEFAULT false NOT NULL,
    flag_trial boolean DEFAULT false NOT NULL,
    balance_amount numeric,
    instructor_name_raw text,
    instructor_name_norm text,
    instructor_staff_id uuid,
    ssp_passed boolean DEFAULT false,
    ssp_passed_at timestamp with time zone,
    ssp_passed_by_user_id uuid
);


--
-- Name: rosters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rosters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid NOT NULL,
    roster_date date NOT NULL,
    source_type text DEFAULT 'manual'::text NOT NULL,
    source_filename text,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    imported_by_user_id uuid,
    hash text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    session_type text NOT NULL,
    user_id uuid,
    shared_mode text,
    location_id uuid,
    token_hash text NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT sessions_session_type_check CHECK ((session_type = ANY (ARRAY['user'::text, 'shared'::text])))
);


--
-- Name: shared_pins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shared_pins (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    location_id uuid NOT NULL,
    mode text NOT NULL,
    pin_hash text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shared_pins_mode_check CHECK ((mode = ANY (ARRAY['front_desk'::text, 'desk_roster'::text])))
);


--
-- Name: ssp_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ssp_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    roster_entry_id uuid,
    location_id uuid,
    swimmer_name text,
    swimmer_external_id text,
    status text NOT NULL,
    note text,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_by_user_id uuid,
    revoked_at timestamp with time zone
);


--
-- Name: staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text NOT NULL,
    phone text,
    birthday date,
    source_system text DEFAULT 'csv'::text NOT NULL,
    source_external_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: staff_directory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_directory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid NOT NULL,
    full_name text NOT NULL,
    iclasspro_staff_id text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: staff_instructor_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_instructor_aliases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid NOT NULL,
    location_id uuid NOT NULL,
    alias_raw text NOT NULL,
    alias_norm text NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: staff_location_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_location_access (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid NOT NULL,
    location_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: staff_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid NOT NULL,
    location_id uuid NOT NULL,
    permission_level text,
    pin text,
    payroll_id text,
    hire_date date,
    is_active boolean DEFAULT true NOT NULL,
    source_external_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: totp_used_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.totp_used_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    used_at timestamp with time zone DEFAULT now()
);


--
-- Name: uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uploads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    location_id uuid,
    uploaded_by_user_id uuid,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    detected_start_date date,
    detected_end_date date,
    parsed_count integer,
    inserted_count integer,
    warnings jsonb
);


--
-- Name: user_backup_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_backup_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    code_hash text NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_location_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_location_access (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    location_id uuid NOT NULL,
    can_staff boolean DEFAULT true NOT NULL,
    can_deck boolean DEFAULT false NOT NULL,
    can_front_desk boolean DEFAULT false NOT NULL,
    can_virtual_desk boolean DEFAULT false NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_locations (
    user_id uuid NOT NULL,
    location_id uuid NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    role_id smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_totp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_totp (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    secret_encrypted text NOT NULL,
    secret_iv text NOT NULL,
    is_enabled boolean DEFAULT false,
    verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_tour_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_tour_progress (
    user_id uuid NOT NULL,
    tour_key text NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    username text NOT NULL,
    pin_hash text NOT NULL,
    must_change_pin boolean DEFAULT true NOT NULL,
    primary_role_id smallint NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_disabled boolean DEFAULT false NOT NULL
);


--
-- Name: acne_leads acne_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acne_leads
    ADD CONSTRAINT acne_leads_pkey PRIMARY KEY (id);


--
-- Name: activity_log activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);


--
-- Name: admin_actions admin_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_actions
    ADD CONSTRAINT admin_actions_pkey PRIMARY KEY (id);


--
-- Name: aged_accounts_rows aged_accounts_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aged_accounts_rows
    ADD CONSTRAINT aged_accounts_rows_pkey PRIMARY KEY (id);


--
-- Name: aged_accounts_snapshots aged_accounts_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aged_accounts_snapshots
    ADD CONSTRAINT aged_accounts_snapshots_pkey PRIMARY KEY (id);


--
-- Name: alerts alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);


--
-- Name: attendance_events attendance_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_events
    ADD CONSTRAINT attendance_events_pkey PRIMARY KEY (id);


--
-- Name: audit_events audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);


--
-- Name: auth_audit_log auth_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_audit_log
    ADD CONSTRAINT auth_audit_log_pkey PRIMARY KEY (id);


--
-- Name: auth_rate_limits auth_rate_limits_identifier_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_rate_limits
    ADD CONSTRAINT auth_rate_limits_identifier_key UNIQUE (identifier);


--
-- Name: auth_rate_limits auth_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_rate_limits
    ADD CONSTRAINT auth_rate_limits_pkey PRIMARY KEY (id);


--
-- Name: billing_tickets billing_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_tickets
    ADD CONSTRAINT billing_tickets_pkey PRIMARY KEY (id);


--
-- Name: class_instances class_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_instances
    ADD CONSTRAINT class_instances_pkey PRIMARY KEY (id);


--
-- Name: class_instances class_instances_unique_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_instances
    ADD CONSTRAINT class_instances_unique_key UNIQUE (location_id, class_date, start_time, class_name);


--
-- Name: client_intake_activity client_intake_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_intake_activity
    ADD CONSTRAINT client_intake_activity_pkey PRIMARY KEY (id);


--
-- Name: client_intakes client_intakes_gmail_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_intakes
    ADD CONSTRAINT client_intakes_gmail_message_id_key UNIQUE (gmail_message_id);


--
-- Name: client_intakes client_intakes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_intakes
    ADD CONSTRAINT client_intakes_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: contact_group_members contact_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_group_members
    ADD CONSTRAINT contact_group_members_pkey PRIMARY KEY (group_id, contact_id);


--
-- Name: contact_groups contact_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_groups
    ADD CONSTRAINT contact_groups_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: coverage_overrides coverage_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coverage_overrides
    ADD CONSTRAINT coverage_overrides_pkey PRIMARY KEY (id);


--
-- Name: day_closures day_closures_location_id_closed_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.day_closures
    ADD CONSTRAINT day_closures_location_id_closed_date_key UNIQUE (location_id, closed_date);


--
-- Name: day_closures day_closures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.day_closures
    ADD CONSTRAINT day_closures_pkey PRIMARY KEY (id);


--
-- Name: drop_events drop_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drop_events
    ADD CONSTRAINT drop_events_pkey PRIMARY KEY (id);


--
-- Name: enrollment_events enrollment_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_events
    ADD CONSTRAINT enrollment_events_pkey PRIMARY KEY (id);


--
-- Name: entity_notes entity_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_notes
    ADD CONSTRAINT entity_notes_pkey PRIMARY KEY (id);


--
-- Name: feature_flags feature_flags_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_key_key UNIQUE (key);


--
-- Name: feature_flags feature_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_pkey PRIMARY KEY (id);


--
-- Name: gmail_oauth_tokens gmail_oauth_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gmail_oauth_tokens
    ADD CONSTRAINT gmail_oauth_tokens_pkey PRIMARY KEY (id);


--
-- Name: homebase_shifts homebase_shifts_location_id_homebase_shift_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homebase_shifts
    ADD CONSTRAINT homebase_shifts_location_id_homebase_shift_id_key UNIQUE (location_id, homebase_shift_id);


--
-- Name: homebase_shifts homebase_shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homebase_shifts
    ADD CONSTRAINT homebase_shifts_pkey PRIMARY KEY (id);


--
-- Name: homebase_staff homebase_staff_location_id_homebase_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homebase_staff
    ADD CONSTRAINT homebase_staff_location_id_homebase_id_key UNIQUE (location_id, homebase_id);


--
-- Name: homebase_staff homebase_staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homebase_staff
    ADD CONSTRAINT homebase_staff_pkey PRIMARY KEY (id);


--
-- Name: instructor_observation_swimmers instructor_observation_swimmers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_observation_swimmers
    ADD CONSTRAINT instructor_observation_swimmers_pkey PRIMARY KEY (id);


--
-- Name: instructor_observations instructor_observations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_observations
    ADD CONSTRAINT instructor_observations_pkey PRIMARY KEY (id);


--
-- Name: instructor_retention_snapshots instructor_retention_snapshot_location_id_instructor_name_a_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_retention_snapshots
    ADD CONSTRAINT instructor_retention_snapshot_location_id_instructor_name_a_key UNIQUE (location_id, instructor_name, as_of_start, as_of_end);


--
-- Name: instructor_retention_snapshots instructor_retention_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_retention_snapshots
    ADD CONSTRAINT instructor_retention_snapshots_pkey PRIMARY KEY (id);


--
-- Name: integration_events integration_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_events
    ADD CONSTRAINT integration_events_pkey PRIMARY KEY (id);


--
-- Name: integration_status integration_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_status
    ADD CONSTRAINT integration_status_pkey PRIMARY KEY (provider, location_id);


--
-- Name: location_features location_features_location_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_features
    ADD CONSTRAINT location_features_location_id_key UNIQUE (location_id);


--
-- Name: location_features location_features_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_features
    ADD CONSTRAINT location_features_pkey PRIMARY KEY (id);


--
-- Name: locations locations_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_code_key UNIQUE (code);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: notification_reads notification_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_reads
    ADD CONSTRAINT notification_reads_pkey PRIMARY KEY (notification_id, staff_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: reconciliations reconciliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliations
    ADD CONSTRAINT reconciliations_pkey PRIMARY KEY (id);


--
-- Name: report_uploads report_uploads_location_id_report_type_sha256_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_uploads
    ADD CONSTRAINT report_uploads_location_id_report_type_sha256_key UNIQUE (location_id, report_type, sha256);


--
-- Name: report_uploads report_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_uploads
    ADD CONSTRAINT report_uploads_pkey PRIMARY KEY (id);


--
-- Name: retention_rows retention_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_rows
    ADD CONSTRAINT retention_rows_pkey PRIMARY KEY (id);


--
-- Name: retention_snapshots retention_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_snapshots
    ADD CONSTRAINT retention_snapshots_pkey PRIMARY KEY (id);


--
-- Name: roles roles_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_key_key UNIQUE (key);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: roster_entries roster_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roster_entries
    ADD CONSTRAINT roster_entries_pkey PRIMARY KEY (id);


--
-- Name: roster_entries roster_entries_unique_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roster_entries
    ADD CONSTRAINT roster_entries_unique_key UNIQUE (location_id, class_date, start_time, swimmer_name);


--
-- Name: roster_uploads roster_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roster_uploads
    ADD CONSTRAINT roster_uploads_pkey PRIMARY KEY (id);


--
-- Name: rosters rosters_location_id_roster_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rosters
    ADD CONSTRAINT rosters_location_id_roster_date_key UNIQUE (location_id, roster_date);


--
-- Name: rosters rosters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rosters
    ADD CONSTRAINT rosters_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: shared_pins shared_pins_location_id_mode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_pins
    ADD CONSTRAINT shared_pins_location_id_mode_key UNIQUE (location_id, mode);


--
-- Name: shared_pins shared_pins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_pins
    ADD CONSTRAINT shared_pins_pkey PRIMARY KEY (id);


--
-- Name: ssp_events ssp_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ssp_events
    ADD CONSTRAINT ssp_events_pkey PRIMARY KEY (id);


--
-- Name: staff_directory staff_directory_location_id_full_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_directory
    ADD CONSTRAINT staff_directory_location_id_full_name_key UNIQUE (location_id, full_name);


--
-- Name: staff_directory staff_directory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_directory
    ADD CONSTRAINT staff_directory_pkey PRIMARY KEY (id);


--
-- Name: staff staff_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_email_key UNIQUE (email);


--
-- Name: staff_instructor_aliases staff_instructor_aliases_location_id_alias_norm_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_instructor_aliases
    ADD CONSTRAINT staff_instructor_aliases_location_id_alias_norm_key UNIQUE (location_id, alias_norm);


--
-- Name: staff_instructor_aliases staff_instructor_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_instructor_aliases
    ADD CONSTRAINT staff_instructor_aliases_pkey PRIMARY KEY (id);


--
-- Name: staff_location_access staff_location_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_location_access
    ADD CONSTRAINT staff_location_access_pkey PRIMARY KEY (id);


--
-- Name: staff_location_access staff_location_access_staff_id_location_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_location_access
    ADD CONSTRAINT staff_location_access_staff_id_location_id_key UNIQUE (staff_id, location_id);


--
-- Name: staff_locations staff_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_locations
    ADD CONSTRAINT staff_locations_pkey PRIMARY KEY (id);


--
-- Name: staff_locations staff_locations_staff_id_location_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_locations
    ADD CONSTRAINT staff_locations_staff_id_location_id_key UNIQUE (staff_id, location_id);


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (id);


--
-- Name: totp_used_tokens totp_used_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.totp_used_tokens
    ADD CONSTRAINT totp_used_tokens_pkey PRIMARY KEY (id);


--
-- Name: uploads uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uploads
    ADD CONSTRAINT uploads_pkey PRIMARY KEY (id);


--
-- Name: user_backup_codes user_backup_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_backup_codes
    ADD CONSTRAINT user_backup_codes_pkey PRIMARY KEY (id);


--
-- Name: user_location_access user_location_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_location_access
    ADD CONSTRAINT user_location_access_pkey PRIMARY KEY (id);


--
-- Name: user_location_access user_location_access_user_id_location_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_location_access
    ADD CONSTRAINT user_location_access_user_id_location_id_key UNIQUE (user_id, location_id);


--
-- Name: user_locations user_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_locations
    ADD CONSTRAINT user_locations_pkey PRIMARY KEY (user_id, location_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: user_totp user_totp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_totp
    ADD CONSTRAINT user_totp_pkey PRIMARY KEY (id);


--
-- Name: user_totp user_totp_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_totp
    ADD CONSTRAINT user_totp_user_id_key UNIQUE (user_id);


--
-- Name: user_tour_progress user_tour_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tour_progress
    ADD CONSTRAINT user_tour_progress_pkey PRIMARY KEY (user_id, tour_key);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: class_instances_location_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_instances_location_date_idx ON public.class_instances USING btree (location_id, class_date);


--
-- Name: class_instances_upload_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_instances_upload_id_idx ON public.class_instances USING btree (upload_id);


--
-- Name: idx_acne_leads_location_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acne_leads_location_date ON public.acne_leads USING btree (location_id, lead_date DESC);


--
-- Name: idx_activity_log_location_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_log_location_created ON public.activity_log USING btree (location_id, created_at DESC);


--
-- Name: idx_admin_actions_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_actions_actor ON public.admin_actions USING btree (actor_user_id);


--
-- Name: idx_admin_actions_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_actions_target ON public.admin_actions USING btree (target_user_id);


--
-- Name: idx_aged_accounts_rows_snapshot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aged_accounts_rows_snapshot ON public.aged_accounts_rows USING btree (snapshot_id);


--
-- Name: idx_alerts_location_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alerts_location_created ON public.alerts USING btree (location_id, created_at DESC);


--
-- Name: idx_alerts_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alerts_type ON public.alerts USING btree (type);


--
-- Name: idx_attendance_events_entry_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_events_entry_time ON public.attendance_events USING btree (roster_entry_id, marked_at DESC);


--
-- Name: idx_audit_events_location_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_events_location_created ON public.audit_events USING btree (location_id, created_at DESC);


--
-- Name: idx_audit_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_events_type ON public.audit_events USING btree (event_type);


--
-- Name: idx_auth_audit_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_audit_created ON public.auth_audit_log USING btree (created_at DESC);


--
-- Name: idx_auth_audit_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_audit_event ON public.auth_audit_log USING btree (event_type);


--
-- Name: idx_auth_audit_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_audit_user ON public.auth_audit_log USING btree (user_id);


--
-- Name: idx_backup_codes_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_backup_codes_user ON public.user_backup_codes USING btree (user_id);


--
-- Name: idx_billing_tickets_location_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_tickets_location_status ON public.billing_tickets USING btree (location_id, status);


--
-- Name: idx_contacts_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_email ON public.contacts USING btree (lower(email));


--
-- Name: idx_contacts_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_phone ON public.contacts USING btree (phone);


--
-- Name: idx_coverage_user_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coverage_user_dates ON public.coverage_overrides USING btree (user_id, start_date, end_date);


--
-- Name: idx_drop_events_location_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drop_events_location_date ON public.drop_events USING btree (location_id, drop_date DESC);


--
-- Name: idx_enrollment_events_location_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrollment_events_location_date ON public.enrollment_events USING btree (location_id, event_date DESC);


--
-- Name: idx_entity_notes_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_notes_entity ON public.entity_notes USING btree (entity_type, entity_id);


--
-- Name: idx_homebase_shifts_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_homebase_shifts_time ON public.homebase_shifts USING btree (location_id, start_at, end_at);


--
-- Name: idx_integration_events_provider_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integration_events_provider_created ON public.integration_events USING btree (provider, created_at DESC);


--
-- Name: idx_notifications_channel_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_channel_created ON public.notifications USING btree (channel, created_at DESC);


--
-- Name: idx_notifications_location_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_location_created ON public.notifications USING btree (location_id, created_at DESC);


--
-- Name: idx_notifications_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_type ON public.notifications USING btree (type);


--
-- Name: idx_reconciliations_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reconciliations_entity ON public.reconciliations USING btree (entity_type, entity_key);


--
-- Name: idx_retention_rows_snapshot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retention_rows_snapshot ON public.retention_rows USING btree (snapshot_id);


--
-- Name: idx_roster_entries_roster_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roster_entries_roster_id ON public.roster_entries USING btree (roster_id);


--
-- Name: idx_roster_entries_ssp_passed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roster_entries_ssp_passed ON public.roster_entries USING btree (ssp_passed);


--
-- Name: idx_sessions_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_expires ON public.sessions USING btree (expires_at);


--
-- Name: idx_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_user ON public.sessions USING btree (user_id);


--
-- Name: idx_ssp_events_location_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ssp_events_location_created ON public.ssp_events USING btree (location_id, created_at DESC);


--
-- Name: idx_ssp_events_swimmer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ssp_events_swimmer ON public.ssp_events USING btree (swimmer_external_id);


--
-- Name: idx_staff_location_access_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_location_access_location ON public.staff_location_access USING btree (location_id);


--
-- Name: idx_staff_location_access_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_location_access_staff ON public.staff_location_access USING btree (staff_id);


--
-- Name: idx_totp_used_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_totp_used_at ON public.totp_used_tokens USING btree (used_at);


--
-- Name: idx_totp_used_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_totp_used_user ON public.totp_used_tokens USING btree (user_id);


--
-- Name: idx_uploads_location_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uploads_location_date ON public.uploads USING btree (location_id, uploaded_at DESC);


--
-- Name: idx_uploads_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uploads_type ON public.uploads USING btree (type);


--
-- Name: idx_user_locations_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_locations_user ON public.user_locations USING btree (user_id);


--
-- Name: idx_user_roles_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_user ON public.user_roles USING btree (user_id);


--
-- Name: roster_entries_instructor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX roster_entries_instructor_idx ON public.roster_entries USING btree (location_id, class_date, instructor_name);


--
-- Name: roster_entries_location_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX roster_entries_location_date_idx ON public.roster_entries USING btree (location_id, class_date);


--
-- Name: roster_entries_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX roster_entries_unique ON public.roster_entries USING btree (location_id, class_date, start_time, swimmer_name);


--
-- Name: roster_uploads_location_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX roster_uploads_location_id_idx ON public.roster_uploads USING btree (location_id);


--
-- Name: roster_uploads_uploaded_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX roster_uploads_uploaded_at_idx ON public.roster_uploads USING btree (uploaded_at);


--
-- Name: uq_acne_leads_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_acne_leads_key ON public.acne_leads USING btree (location_id, lead_date, lower(COALESCE(full_name, ''::text)), lower(COALESCE(email, ''::text)), regexp_replace(COALESCE(phone, ''::text), '\D'::text, ''::text, 'g'::text));


--
-- Name: uq_aged_accounts_row_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_aged_accounts_row_key ON public.aged_accounts_rows USING btree (snapshot_id, lower(COALESCE(bucket, ''::text)));


--
-- Name: uq_aged_accounts_snapshot; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_aged_accounts_snapshot ON public.aged_accounts_snapshots USING btree (location_id, report_date);


--
-- Name: uq_drop_events_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_drop_events_key ON public.drop_events USING btree (location_id, drop_date, lower(COALESCE(swimmer_name, ''::text)), lower(COALESCE(reason, ''::text)));


--
-- Name: uq_enrollment_events_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_enrollment_events_key ON public.enrollment_events USING btree (location_id, event_date, lower(COALESCE(swimmer_name, ''::text)));


--
-- Name: uq_retention_snapshot_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_retention_snapshot_key ON public.retention_snapshots USING btree (location_id, report_date);


--
-- Name: billing_tickets trg_billing_tickets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_billing_tickets_updated_at BEFORE UPDATE ON public.billing_tickets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: client_intakes trg_client_intakes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_client_intakes_updated_at BEFORE UPDATE ON public.client_intakes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: clients trg_clients_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: contacts trg_contacts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: gmail_oauth_tokens trg_gmail_oauth_tokens_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gmail_oauth_tokens_updated_at BEFORE UPDATE ON public.gmail_oauth_tokens FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: instructor_observations trg_instructor_observations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_instructor_observations_updated_at BEFORE UPDATE ON public.instructor_observations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: roster_entries trg_roster_entries_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_roster_entries_updated_at BEFORE UPDATE ON public.roster_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: staff_directory trg_staff_directory_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_staff_directory_updated_at BEFORE UPDATE ON public.staff_directory FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: staff_location_access trg_staff_location_access_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_staff_location_access_updated_at BEFORE UPDATE ON public.staff_location_access FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: staff_locations trg_staff_locations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_staff_locations_updated_at BEFORE UPDATE ON public.staff_locations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: staff trg_staff_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_staff_updated_at BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: users trg_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: acne_leads acne_leads_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acne_leads
    ADD CONSTRAINT acne_leads_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: acne_leads acne_leads_source_upload_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acne_leads
    ADD CONSTRAINT acne_leads_source_upload_id_fkey FOREIGN KEY (source_upload_id) REFERENCES public.uploads(id) ON DELETE SET NULL;


--
-- Name: activity_log activity_log_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: activity_log activity_log_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: admin_actions admin_actions_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_actions
    ADD CONSTRAINT admin_actions_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: admin_actions admin_actions_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_actions
    ADD CONSTRAINT admin_actions_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: admin_actions admin_actions_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_actions
    ADD CONSTRAINT admin_actions_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: aged_accounts_rows aged_accounts_rows_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aged_accounts_rows
    ADD CONSTRAINT aged_accounts_rows_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.aged_accounts_snapshots(id) ON DELETE CASCADE;


--
-- Name: aged_accounts_snapshots aged_accounts_snapshots_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aged_accounts_snapshots
    ADD CONSTRAINT aged_accounts_snapshots_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: aged_accounts_snapshots aged_accounts_snapshots_source_upload_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aged_accounts_snapshots
    ADD CONSTRAINT aged_accounts_snapshots_source_upload_id_fkey FOREIGN KEY (source_upload_id) REFERENCES public.uploads(id) ON DELETE SET NULL;


--
-- Name: alerts alerts_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: alerts alerts_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: attendance_events attendance_events_roster_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_events
    ADD CONSTRAINT attendance_events_roster_entry_id_fkey FOREIGN KEY (roster_entry_id) REFERENCES public.roster_entries(id) ON DELETE CASCADE;


--
-- Name: audit_events audit_events_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: audit_events audit_events_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: auth_audit_log auth_audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_audit_log
    ADD CONSTRAINT auth_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: billing_tickets billing_tickets_assigned_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_tickets
    ADD CONSTRAINT billing_tickets_assigned_to_user_id_fkey FOREIGN KEY (assigned_to_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: billing_tickets billing_tickets_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_tickets
    ADD CONSTRAINT billing_tickets_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: billing_tickets billing_tickets_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_tickets
    ADD CONSTRAINT billing_tickets_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: billing_tickets billing_tickets_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_tickets
    ADD CONSTRAINT billing_tickets_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: class_instances class_instances_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_instances
    ADD CONSTRAINT class_instances_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: class_instances class_instances_upload_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_instances
    ADD CONSTRAINT class_instances_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES public.roster_uploads(id) ON DELETE SET NULL;


--
-- Name: client_intake_activity client_intake_activity_intake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_intake_activity
    ADD CONSTRAINT client_intake_activity_intake_id_fkey FOREIGN KEY (intake_id) REFERENCES public.client_intakes(id) ON DELETE CASCADE;


--
-- Name: client_intake_activity client_intake_activity_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_intake_activity
    ADD CONSTRAINT client_intake_activity_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;


--
-- Name: client_intakes client_intakes_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_intakes
    ADD CONSTRAINT client_intakes_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: client_intakes client_intakes_owner_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_intakes
    ADD CONSTRAINT client_intakes_owner_staff_id_fkey FOREIGN KEY (owner_staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;


--
-- Name: clients clients_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: contact_group_members contact_group_members_added_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_group_members
    ADD CONSTRAINT contact_group_members_added_by_user_id_fkey FOREIGN KEY (added_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: contact_group_members contact_group_members_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_group_members
    ADD CONSTRAINT contact_group_members_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_group_members contact_group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_group_members
    ADD CONSTRAINT contact_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.contact_groups(id) ON DELETE CASCADE;


--
-- Name: contact_groups contact_groups_canonical_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_groups
    ADD CONSTRAINT contact_groups_canonical_contact_id_fkey FOREIGN KEY (canonical_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: coverage_overrides coverage_overrides_granted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coverage_overrides
    ADD CONSTRAINT coverage_overrides_granted_by_user_id_fkey FOREIGN KEY (granted_by_user_id) REFERENCES public.users(id);


--
-- Name: coverage_overrides coverage_overrides_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coverage_overrides
    ADD CONSTRAINT coverage_overrides_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: coverage_overrides coverage_overrides_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coverage_overrides
    ADD CONSTRAINT coverage_overrides_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: day_closures day_closures_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.day_closures
    ADD CONSTRAINT day_closures_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: day_closures day_closures_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.day_closures
    ADD CONSTRAINT day_closures_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: day_closures day_closures_reopened_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.day_closures
    ADD CONSTRAINT day_closures_reopened_by_fkey FOREIGN KEY (reopened_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: drop_events drop_events_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drop_events
    ADD CONSTRAINT drop_events_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: drop_events drop_events_source_upload_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drop_events
    ADD CONSTRAINT drop_events_source_upload_id_fkey FOREIGN KEY (source_upload_id) REFERENCES public.uploads(id) ON DELETE SET NULL;


--
-- Name: enrollment_events enrollment_events_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_events
    ADD CONSTRAINT enrollment_events_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: enrollment_events enrollment_events_source_upload_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_events
    ADD CONSTRAINT enrollment_events_source_upload_id_fkey FOREIGN KEY (source_upload_id) REFERENCES public.uploads(id) ON DELETE SET NULL;


--
-- Name: entity_notes entity_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_notes
    ADD CONSTRAINT entity_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: entity_notes entity_notes_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_notes
    ADD CONSTRAINT entity_notes_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: homebase_shifts homebase_shifts_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homebase_shifts
    ADD CONSTRAINT homebase_shifts_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: homebase_shifts homebase_shifts_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homebase_shifts
    ADD CONSTRAINT homebase_shifts_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;


--
-- Name: homebase_staff homebase_staff_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homebase_staff
    ADD CONSTRAINT homebase_staff_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: instructor_observation_swimmers instructor_observation_swimmers_observation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_observation_swimmers
    ADD CONSTRAINT instructor_observation_swimmers_observation_id_fkey FOREIGN KEY (observation_id) REFERENCES public.instructor_observations(id) ON DELETE CASCADE;


--
-- Name: instructor_observations instructor_observations_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_observations
    ADD CONSTRAINT instructor_observations_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: instructor_observations instructor_observations_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_observations
    ADD CONSTRAINT instructor_observations_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_directory(id) ON DELETE SET NULL;


--
-- Name: instructor_retention_snapshots instructor_retention_snapshots_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_retention_snapshots
    ADD CONSTRAINT instructor_retention_snapshots_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: instructor_retention_snapshots instructor_retention_snapshots_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_retention_snapshots
    ADD CONSTRAINT instructor_retention_snapshots_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_directory(id) ON DELETE SET NULL;


--
-- Name: location_features location_features_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_features
    ADD CONSTRAINT location_features_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: notification_reads notification_reads_notification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_reads
    ADD CONSTRAINT notification_reads_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE CASCADE;


--
-- Name: notification_reads notification_reads_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_reads
    ADD CONSTRAINT notification_reads_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_created_by_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_created_by_staff_id_fkey FOREIGN KEY (created_by_staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: reconciliations reconciliations_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliations
    ADD CONSTRAINT reconciliations_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: reconciliations reconciliations_resolved_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliations
    ADD CONSTRAINT reconciliations_resolved_by_user_id_fkey FOREIGN KEY (resolved_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: report_uploads report_uploads_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_uploads
    ADD CONSTRAINT report_uploads_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: report_uploads report_uploads_uploaded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_uploads
    ADD CONSTRAINT report_uploads_uploaded_by_user_id_fkey FOREIGN KEY (uploaded_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: retention_rows retention_rows_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_rows
    ADD CONSTRAINT retention_rows_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.retention_snapshots(id) ON DELETE CASCADE;


--
-- Name: retention_snapshots retention_snapshots_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_snapshots
    ADD CONSTRAINT retention_snapshots_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: retention_snapshots retention_snapshots_source_upload_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_snapshots
    ADD CONSTRAINT retention_snapshots_source_upload_id_fkey FOREIGN KEY (source_upload_id) REFERENCES public.uploads(id) ON DELETE SET NULL;


--
-- Name: roster_entries roster_entries_attendance_marked_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roster_entries
    ADD CONSTRAINT roster_entries_attendance_marked_by_user_id_fkey FOREIGN KEY (attendance_marked_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: roster_entries roster_entries_instructor_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roster_entries
    ADD CONSTRAINT roster_entries_instructor_staff_id_fkey FOREIGN KEY (instructor_staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;


--
-- Name: roster_entries roster_entries_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roster_entries
    ADD CONSTRAINT roster_entries_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: roster_entries roster_entries_roster_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roster_entries
    ADD CONSTRAINT roster_entries_roster_id_fkey FOREIGN KEY (roster_id) REFERENCES public.rosters(id) ON DELETE CASCADE;


--
-- Name: roster_entries roster_entries_ssp_passed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roster_entries
    ADD CONSTRAINT roster_entries_ssp_passed_by_user_id_fkey FOREIGN KEY (ssp_passed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: roster_entries roster_entries_upload_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roster_entries
    ADD CONSTRAINT roster_entries_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES public.roster_uploads(id) ON DELETE SET NULL;


--
-- Name: roster_uploads roster_uploads_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roster_uploads
    ADD CONSTRAINT roster_uploads_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: roster_uploads roster_uploads_uploaded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roster_uploads
    ADD CONSTRAINT roster_uploads_uploaded_by_user_id_fkey FOREIGN KEY (uploaded_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: sessions sessions_location_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_location_fk FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: shared_pins shared_pins_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_pins
    ADD CONSTRAINT shared_pins_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: ssp_events ssp_events_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ssp_events
    ADD CONSTRAINT ssp_events_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ssp_events ssp_events_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ssp_events
    ADD CONSTRAINT ssp_events_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: ssp_events ssp_events_revoked_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ssp_events
    ADD CONSTRAINT ssp_events_revoked_by_user_id_fkey FOREIGN KEY (revoked_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ssp_events ssp_events_roster_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ssp_events
    ADD CONSTRAINT ssp_events_roster_entry_id_fkey FOREIGN KEY (roster_entry_id) REFERENCES public.roster_entries(id) ON DELETE SET NULL;


--
-- Name: staff_directory staff_directory_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_directory
    ADD CONSTRAINT staff_directory_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: staff_instructor_aliases staff_instructor_aliases_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_instructor_aliases
    ADD CONSTRAINT staff_instructor_aliases_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: staff_instructor_aliases staff_instructor_aliases_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_instructor_aliases
    ADD CONSTRAINT staff_instructor_aliases_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: staff_location_access staff_location_access_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_location_access
    ADD CONSTRAINT staff_location_access_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: staff_location_access staff_location_access_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_location_access
    ADD CONSTRAINT staff_location_access_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: staff_locations staff_locations_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_locations
    ADD CONSTRAINT staff_locations_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: staff_locations staff_locations_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_locations
    ADD CONSTRAINT staff_locations_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: totp_used_tokens totp_used_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.totp_used_tokens
    ADD CONSTRAINT totp_used_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: uploads uploads_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uploads
    ADD CONSTRAINT uploads_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: uploads uploads_uploaded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uploads
    ADD CONSTRAINT uploads_uploaded_by_user_id_fkey FOREIGN KEY (uploaded_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_backup_codes user_backup_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_backup_codes
    ADD CONSTRAINT user_backup_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_location_access user_location_access_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_location_access
    ADD CONSTRAINT user_location_access_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: user_location_access user_location_access_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_location_access
    ADD CONSTRAINT user_location_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_locations user_locations_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_locations
    ADD CONSTRAINT user_locations_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: user_locations user_locations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_locations
    ADD CONSTRAINT user_locations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_totp user_totp_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_totp
    ADD CONSTRAINT user_totp_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_tour_progress user_tour_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tour_progress
    ADD CONSTRAINT user_tour_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_primary_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_primary_role_id_fkey FOREIGN KEY (primary_role_id) REFERENCES public.roles(id);


--
-- PostgreSQL database dump complete
--

\unrestrict 1GQgwcTzTANbGzFhmh2Rf2sWAxHlgGG5flA6BtVvJLKV5h8nnr5QlI82YTYd3Up


--
-- Dbmate schema migrations
--

INSERT INTO public.schema_migrations (version) VALUES
    ('20260129194622'),
    ('20260129212638'),
    ('20260129213509'),
    ('20260129213540'),
    ('20260130011429'),
    ('20260131141845'),
    ('20260131170400'),
    ('20260131170415'),
    ('20260131170558'),
    ('20260131172123'),
    ('20260201120000'),
    ('20260201123000'),
    ('20260201124500'),
    ('20260201131000'),
    ('20260201140000'),
    ('20260201170000'),
    ('20260201180000'),
    ('20260201190000'),
    ('20260202085000'),
    ('20260202090000'),
    ('20260202091000'),
    ('20260202092000'),
    ('20260202100000'),
    ('20260202100500'),
    ('20260202101000'),
    ('20260202102000'),
    ('20260202103000'),
    ('20260202103100'),
    ('20260202120000'),
    ('20260202140000'),
    ('20260203120000'),
    ('20260203121000'),
    ('20260205180000'),
    ('20260206000000'),
    ('20260206003000');
