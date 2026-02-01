\restrict DEM3lguJodUtHTigDSfoW9kze0zCl9HioZgOrnMnueSIdMy7yVIyQyYhz6r43d0

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
    balance_amount numeric
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
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: attendance_events attendance_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_events
    ADD CONSTRAINT attendance_events_pkey PRIMARY KEY (id);


--
-- Name: class_instances class_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_instances
    ADD CONSTRAINT class_instances_pkey PRIMARY KEY (id);


--
-- Name: coverage_overrides coverage_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coverage_overrides
    ADD CONSTRAINT coverage_overrides_pkey PRIMARY KEY (id);


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
-- Name: idx_attendance_events_entry_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_events_entry_time ON public.attendance_events USING btree (roster_entry_id, marked_at DESC);


--
-- Name: idx_coverage_user_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coverage_user_dates ON public.coverage_overrides USING btree (user_id, start_date, end_date);


--
-- Name: idx_roster_entries_roster_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roster_entries_roster_id ON public.roster_entries USING btree (roster_id);


--
-- Name: idx_sessions_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_expires ON public.sessions USING btree (expires_at);


--
-- Name: idx_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_user ON public.sessions USING btree (user_id);


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
-- Name: roster_entries trg_roster_entries_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_roster_entries_updated_at BEFORE UPDATE ON public.roster_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: users trg_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: attendance_events attendance_events_roster_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_events
    ADD CONSTRAINT attendance_events_roster_entry_id_fkey FOREIGN KEY (roster_entry_id) REFERENCES public.roster_entries(id) ON DELETE CASCADE;


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
-- Name: roster_entries roster_entries_attendance_marked_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roster_entries
    ADD CONSTRAINT roster_entries_attendance_marked_by_user_id_fkey FOREIGN KEY (attendance_marked_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


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
-- Name: users users_primary_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_primary_role_id_fkey FOREIGN KEY (primary_role_id) REFERENCES public.roles(id);


--
-- PostgreSQL database dump complete
--

\unrestrict DEM3lguJodUtHTigDSfoW9kze0zCl9HioZgOrnMnueSIdMy7yVIyQyYhz6r43d0


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
    ('20260201131000');
