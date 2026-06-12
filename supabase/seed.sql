-- ================================================================
-- LeadLayer OS — Dev Seed
-- Run AFTER signing up as operator@leadlayer.test in the app.
-- ================================================================

DO $$
DECLARE
  -- ── Auth ──────────────────────────────────────────────────────
  v_operator_id       uuid;

  -- ── Tenant ────────────────────────────────────────────────────
  v_tenant_id         uuid := gen_random_uuid();
  v_portal_token      text := encode(gen_random_bytes(24), 'hex');

  -- ── Connections ───────────────────────────────────────────────
  v_conn_id           uuid := gen_random_uuid();
  v_wp_conn_id        uuid := gen_random_uuid();
  v_inv_1             uuid := gen_random_uuid();
  v_inv_2             uuid := gen_random_uuid();
  v_inv_3             uuid := gen_random_uuid();

  -- ── Growth ────────────────────────────────────────────────────
  v_goal_id           uuid := gen_random_uuid();
  v_plan_id           uuid := gen_random_uuid();
  v_item_1            uuid := gen_random_uuid();
  v_item_2            uuid := gen_random_uuid();
  v_item_3            uuid := gen_random_uuid();
  v_item_4            uuid := gen_random_uuid();
  v_item_5            uuid := gen_random_uuid();

  -- ── Market intel ──────────────────────────────────────────────
  v_scan_id           uuid := gen_random_uuid();
  v_cluster_1         uuid := gen_random_uuid();
  v_cluster_2         uuid := gen_random_uuid();

  -- ── Business profile ──────────────────────────────────────────
  v_bp_id             uuid := gen_random_uuid();
  v_tone_id           uuid := gen_random_uuid();
  v_gbp_id            uuid := gen_random_uuid();

  -- ── Audit pipeline ────────────────────────────────────────────
  v_audit_id          uuid := gen_random_uuid();
  v_page_home         uuid := gen_random_uuid();
  v_page_svc          uuid := gen_random_uuid();
  v_page_loc          uuid := gen_random_uuid();
  v_ap_home           uuid := gen_random_uuid();
  v_ap_svc            uuid := gen_random_uuid();
  v_ap_loc            uuid := gen_random_uuid();
  v_pi_home           uuid := gen_random_uuid();
  v_pi_svc            uuid := gen_random_uuid();
  v_pi_loc            uuid := gen_random_uuid();

  -- ── Execution ─────────────────────────────────────────────────
  v_artifact_1        uuid := gen_random_uuid();
  v_artifact_2        uuid := gen_random_uuid();
  v_artifact_3        uuid := gen_random_uuid();

  -- ── Leads ─────────────────────────────────────────────────────
  v_ingestion_id      uuid := gen_random_uuid();
  v_ingestion_key     text := 'llk_' || encode(gen_random_bytes(16), 'hex');
  v_lead_1            uuid := gen_random_uuid();
  v_lead_2            uuid := gen_random_uuid();
  v_lead_3            uuid := gen_random_uuid();
  v_lead_4            uuid := gen_random_uuid();
  v_lead_5            uuid := gen_random_uuid();
  v_lead_6            uuid := gen_random_uuid();
  v_lead_7            uuid := gen_random_uuid();

  -- ── Reporting ─────────────────────────────────────────────────
  v_report_id         uuid := gen_random_uuid();
  v_share_token       text := encode(gen_random_bytes(16), 'hex');

BEGIN

  -- ── 0. Find operator user ──────────────────────────────────────
  SELECT id INTO v_operator_id
  FROM auth.users
  WHERE email = 'operator@leadlayer.test'
  LIMIT 1;

  IF v_operator_id IS NULL THEN
    RAISE EXCEPTION
      E'\n\n  ✗ No user found with email: operator@leadlayer.test\n'
      '  → Sign up in the app with that email first, then re-run this seed.\n';
  END IF;

  RAISE NOTICE '✓ Found operator user: %', v_operator_id;

  -- ── 1. Tenant ─────────────────────────────────────────────────
  INSERT INTO public.tenants
    (id, name, geo, vertical, status, plan, portal_token, portal_token_created_at)
  VALUES
    (v_tenant_id, 'Hartman Klimaat & Sanitair', 'NL', 'home_services',
     'active', 'pro', v_portal_token, now());

  INSERT INTO public.memberships (user_id, tenant_id, role)
  VALUES (v_operator_id, v_tenant_id, 'owner');

  -- Profile: make sure display_name is set
  UPDATE public.profiles
  SET display_name = 'LP (Operator)', updated_at = now()
  WHERE id = v_operator_id;

  RAISE NOTICE '✓ Tenant + membership created';

  -- ── 2. Site connection + WordPress ────────────────────────────
  INSERT INTO public.site_connections
    (id, tenant_id, type, status, base_url, username)
  VALUES
    (v_conn_id, v_tenant_id, 'wordpress', 'connected',
     'https://hartmanklimaat.nl', 'hartman_admin');

  INSERT INTO public.wordpress_connections
    (id, tenant_id, site_connection_id, kind, base_url, rest_base_url,
     status, capabilities, last_checked_at)
  VALUES
    (v_wp_conn_id, v_tenant_id, v_conn_id, 'self_hosted',
     'https://hartmanklimaat.nl',
     'https://hartmanklimaat.nl/wp-json/wp/v2',
     'connected',
     '{"can_read_posts":true,"can_write_posts":true,"yoast_active":true,"rankmath_active":false,"page_builder":"elementor"}',
     now() - interval '2 hours');

  INSERT INTO public.wordpress_site_inventory
    (id, tenant_id, wordpress_connection_id, site_connection_id,
     wp_post_id, post_type, status, title, slug, link, template, last_synced_at)
  VALUES
    (v_inv_1, v_tenant_id, v_wp_conn_id, v_conn_id,
     1, 'page', 'publish', 'Home', '',
     'https://hartmanklimaat.nl/', 'elementor_canvas', now()),
    (v_inv_2, v_tenant_id, v_wp_conn_id, v_conn_id,
     12, 'page', 'publish', 'Airco Installatie',
     'diensten/airco-installatie',
     'https://hartmanklimaat.nl/diensten/airco-installatie/',
     'elementor_full_width', now()),
    (v_inv_3, v_tenant_id, v_wp_conn_id, v_conn_id,
     24, 'page', 'publish', 'CV-ketel Onderhoud',
     'diensten/cv-ketel-onderhoud',
     'https://hartmanklimaat.nl/diensten/cv-ketel-onderhoud/',
     'elementor_full_width', now());

  RAISE NOTICE '✓ Site connection + WP inventory created';

  -- ── 3. Growth goal ────────────────────────────────────────────
  INSERT INTO public.growth_goals
    (id, tenant_id, title, target_type, target_count, current_count,
     timeframe_months, lead_value, close_rate, required_leads,
     service_focus, locations, good_fit_leads, bad_fit_leads,
     capacity_notes, tier, notification_email, notify_on_lead,
     next_call_at, call_cadence, status, confidence, source)
  VALUES
    (v_goal_id, v_tenant_id,
     '8 nieuwe klanten per maand via website',
     'clients', 8, 3, 6, 1650, 0.30, 27,
     '["Airco installatie","Warmtepomp","CV-ketel onderhoud","Vloerverwarming"]',
     '["Eindhoven","Tilburg","Den Bosch","Helmond"]',
     '["Woningeigenaren renovatie","VvE''s","Kleine bedrijfspanden"]',
     '["Alleen keuring gewenst","Geen budget renovatie","Buiten werkgebied"]',
     '4 monteurs beschikbaar. Max 6 installaties per dag.',
     'growth',
     'info@hartmanklimaat.nl', true,
     now() + interval '12 days',
     'monthly', 'active', 0.75, 'operator');

  RAISE NOTICE '✓ Growth goal created';

  -- ── 4. Master plan + items ────────────────────────────────────
  INSERT INTO public.master_plans
    (id, tenant_id, growth_goal_id, status, summary, strategy_summary,
     lead_math, confidence)
  VALUES
    (v_plan_id, v_tenant_id, v_goal_id, 'active',
     'Focus op lokale zoekintentie voor airco & warmtepomp in regio Eindhoven. '
     'Nieuwe service- en locatiepagina''s + homepage optimalisatie.',
     'Combineer hogevolume-service keywords (airco installatie eindhoven) '
     'met geografische spreiding (tilburg, den bosch). Bewijs via reviews en keurmerken.',
     '{"monthlyLeadsNeeded":27,"currentLeads":3,"gap":24,"pagesNeeded":8,"pagesLive":1}',
     0.78);

  INSERT INTO public.masterplan_items
    (id, tenant_id, master_plan_id, linked_goal_id, type, title, description,
     priority, status, effort, expected_impact, source)
  VALUES
    (v_item_1, v_tenant_id, v_plan_id, v_goal_id,
     'service_page', 'Airco Installatie Eindhoven',
     'Nieuwe pagina voor "airco installatie eindhoven" (2.900/mnd). '
     'Hoog commercieel, direct converterend.',
     'critical', 'done', 'medium', 'high', 'ai'),

    (v_item_2, v_tenant_id, v_plan_id, v_goal_id,
     'service_page', 'Warmtepomp Installatie Eindhoven',
     'Pagina voor "warmtepomp installatie eindhoven" (1.600/mnd). '
     'Subsidie-angle verwerken (ISDE-regeling).',
     'high', 'done', 'medium', 'high', 'ai'),

    (v_item_3, v_tenant_id, v_plan_id, v_goal_id,
     'location_page', 'Airco Tilburg',
     'Locatiepagina Tilburg voor geografische spreiding. '
     '"airco installateur tilburg" (720/mnd).',
     'high', 'approved', 'low', 'medium', 'ai'),

    (v_item_4, v_tenant_id, v_plan_id, v_goal_id,
     'website_fix', 'Homepage optimalisatie',
     'H1 ontbreekt. Meta description generiek. '
     'Geen schema markup aanwezig. Snel te verbeteren.',
     'high', 'in_progress', 'low', 'high', 'audit'),

    (v_item_5, v_tenant_id, v_plan_id, v_goal_id,
     'service_page', 'CV-ketel Onderhoud Eindhoven',
     'Onderhoudspagina voor bestaande klanten + nieuwe aanvragen. '
     '"cv ketel onderhoud eindhoven" (880/mnd).',
     'medium', 'proposed', 'medium', 'medium', 'ai');

  RAISE NOTICE '✓ Master plan + 5 items created';

  -- ── 5. Market scan + keywords + clusters ──────────────────────
  INSERT INTO public.market_scans
    (id, tenant_id, growth_goal_id, status, language, country, region,
     vertical, services, locations, source, scan_started_at, scan_completed_at,
     summary, confidence)
  VALUES
    (v_scan_id, v_tenant_id, v_goal_id, 'completed',
     'nl', 'NL', 'Noord-Brabant', 'home_services',
     '["airco","warmtepomp","cv-ketel","vloerverwarming"]',
     '["Eindhoven","Tilburg","Den Bosch","Helmond"]',
     'dataforseo',
     now() - interval '5 days',
     now() - interval '5 days' + interval '12 minutes',
     '{"totalKeywords":48,"totalVolume":18400,"topIntent":"commercial","clusters":6}',
     0.82);

  INSERT INTO public.market_keywords
    (tenant_id, market_scan_id, service, location, keyword,
     intent, volume, difficulty, cpc, source)
  VALUES
    (v_tenant_id, v_scan_id, 'airco', 'Eindhoven',
     'airco installatie eindhoven', 'commercial', 2900, 42, 3.80, 'dataforseo'),
    (v_tenant_id, v_scan_id, 'airco', 'Eindhoven',
     'airco eindhoven installeren', 'commercial', 720, 38, 3.20, 'dataforseo'),
    (v_tenant_id, v_scan_id, 'warmtepomp', 'Eindhoven',
     'warmtepomp installatie eindhoven', 'commercial', 1600, 51, 4.50, 'dataforseo'),
    (v_tenant_id, v_scan_id, 'warmtepomp', 'Eindhoven',
     'warmtepomp subsidie eindhoven', 'commercial', 480, 35, 2.90, 'dataforseo'),
    (v_tenant_id, v_scan_id, 'airco', 'Tilburg',
     'airco installateur tilburg', 'commercial', 720, 36, 3.40, 'dataforseo'),
    (v_tenant_id, v_scan_id, 'cv-ketel', 'Eindhoven',
     'cv ketel onderhoud eindhoven', 'service', 880, 28, 2.20, 'dataforseo'),
    (v_tenant_id, v_scan_id, 'cv-ketel', 'Eindhoven',
     'cv ketel storing eindhoven spoed', 'emergency', 390, 22, 4.10, 'dataforseo');

  INSERT INTO public.market_demand_clusters
    (id, tenant_id, market_scan_id, cluster_name, service, location,
     intent, total_volume, keyword_count, average_difficulty,
     opportunity_score, priority, representative_keywords)
  VALUES
    (v_cluster_1, v_tenant_id, v_scan_id,
     'Airco installatie Eindhoven', 'airco', 'Eindhoven',
     'commercial', 3620, 2, 40, 0.84, 'critical',
     '["airco installatie eindhoven","airco eindhoven installeren"]'),
    (v_cluster_2, v_tenant_id, v_scan_id,
     'Warmtepomp regio Eindhoven', 'warmtepomp', 'Eindhoven',
     'commercial', 2080, 2, 43, 0.79, 'high',
     '["warmtepomp installatie eindhoven","warmtepomp subsidie eindhoven"]');

  RAISE NOTICE '✓ Market scan + keywords + clusters created';

  -- ── 6. Business profile ───────────────────────────────────────
  INSERT INTO public.business_profiles_v2
    (id, tenant_id, status, confidence_score,
     business_identity, offer_profile, icp_profile,
     location_profile, conversion_profile, proof_profile,
     claim_guardrails, strategy_angles)
  VALUES
    (v_bp_id, v_tenant_id, 'active', 0.82,
     '{"name":"Hartman Klimaat & Sanitair","founded":2011,"tagline":"Betrouwbaar. Snel. Vakkundig.","employees":6,"certifications":["F-gassen gecertificeerd","STEK erkend","Daikin Premier Partner"]}',
     '{"primary":"Airco installatie en onderhoud","secondary":["Warmtepomp installatie","CV-ketel service","Vloerverwarming","Ventilatie"],"priceRange":"middensegment","responseTime":"zelfde dag voor storingen"}',
     '{"primary":"Woningeigenaren 35-65 jaar renovatie of comfort-upgrade","secondary":["VvE beheerders","ZZP-ers kantoor aan huis"],"notFit":["Grote projectontwikkelaars","Enkel keuring"]}',
     '{"primaryCity":"Eindhoven","radius":40,"coveredCities":["Tilburg","Den Bosch","Helmond","Waalre","Veldhoven"],"language":"nl"}',
     '{"mainCTA":"Vraag offerte aan","phone":"040-1234567","urgencyCTA":"Storing? Bel direct","leadQualifiers":["Gratis thuisadvies","Binnen 48u reactie"]}',
     '{"reviewCount":67,"averageRating":4.8,"platform":"Google","notableReviews":["Snel en netjes gewerkt, aanrader!","Binnen 2 uur ter plaatse bij storing"],"trustBadges":["STEK","Daikin Premier","10 jaar garantie"]}',
     '{"avoidClaims":["Goedkoopste","#1 in Nederland"],"avoidTopics":["Prijsvergelijking zonder context","Garantie zonder voorwaarden"]}',
     '[{"angle":"Lokale snelheid","description":"Regio Eindhoven, zelfde dag beschikbaar"},{"angle":"Subsidie-expert","description":"ISDE en SEEH warmtepomp subsidie begeleiding"}]');

  INSERT INTO public.tone_profiles
    (id, tenant_id, status, language, locale, profile,
     confidence_score, job_status, analyzed_at)
  VALUES
    (v_tone_id, v_tenant_id, 'approved', 'nl', 'nl-NL',
     '{"formality":"informal","personality":["direct","betrouwbaar","vakkundig"],"sentenceLength":"medium","avoidPatterns":["overdreven superlatieven","vage beloften"],"preferredOpenings":["Als u","Wij zorgen","Direct"],"cta_style":"actiegericht"}',
     0.78, 'done', now() - interval '3 days');

  INSERT INTO public.gbp_profiles
    (id, tenant_id, growth_goal_id, status, source,
     business_name, primary_category, rating, review_count,
     photos_status, posts_status, nap_consistency,
     completeness_score, trust_score, local_visibility_score,
     gaps, recommendations)
  VALUES
    (v_gbp_id, v_tenant_id, v_goal_id, 'reviewed', 'manual',
     'Hartman Klimaat & Sanitair',
     'Air conditioning contractor',
     4.8, 67,
     'strong', 'occasional', 'consistent',
     0.82, 0.79, 0.71,
     '["Geen recente Google Posts (>30 dagen)","Openingstijden niet volledig"]',
     '["Post maandelijks 1 Google Post met actie/tip","Voeg spoed-openingstijden toe"]');

  RAISE NOTICE '✓ Business profile + tone + GBP created';

  -- ── 7. Pages ──────────────────────────────────────────────────
  INSERT INTO public.pages
    (id, tenant_id, site_connection_id, wp_post_id, url, title,
     meta_description, h1, status_code, health_score, last_audited_at)
  VALUES
    (v_page_home, v_tenant_id, v_conn_id, 1,
     'https://hartmanklimaat.nl/',
     'Hartman Klimaat & Sanitair | Eindhoven',
     'Airco, warmtepomp en cv-ketel specialist in regio Eindhoven. Bel voor een gratis adviesgesprek.',
     NULL, 200, 54, now() - interval '2 days'),

    (v_page_svc, v_tenant_id, v_conn_id, 12,
     'https://hartmanklimaat.nl/diensten/airco-installatie/',
     'Airco Installatie Eindhoven | Hartman Klimaat',
     'Professionele airco installatie in Eindhoven. F-gassen gecertificeerd. Gratis offerte.',
     'Airco Installatie Eindhoven', 200, 78, now() - interval '2 days'),

    (v_page_loc, v_tenant_id, v_conn_id, 24,
     'https://hartmanklimaat.nl/diensten/cv-ketel-onderhoud/',
     'CV-ketel Onderhoud | Hartman Klimaat & Sanitair',
     'Betrouwbaar cv-ketel onderhoud in Eindhoven en omstreken. STEK erkend. Vanaf €89.',
     'CV-ketel Onderhoud Eindhoven', 200, 62, now() - interval '2 days');

  RAISE NOTICE '✓ Pages created';

  -- ── 8. Audit + audit_pages + page_intelligence ────────────────
  INSERT INTO public.audits
    (id, tenant_id, site_connection_id, status,
     started_at, finished_at, pages_count, summary)
  VALUES
    (v_audit_id, v_tenant_id, v_conn_id, 'succeeded',
     now() - interval '2 days',
     now() - interval '2 days' + interval '8 minutes',
     3,
     '{"totalIssues":12,"critical":0,"high":3,"medium":6,"low":3,"avgHealthScore":65}');

  INSERT INTO public.audit_pages
    (id, audit_id, tenant_id, page_id, url, status_code, title,
     meta_description, h1, images_without_alt, word_count, issues)
  VALUES
    (v_ap_home, v_audit_id, v_tenant_id, v_page_home,
     'https://hartmanklimaat.nl/', 200,
     'Hartman Klimaat & Sanitair | Eindhoven',
     'Airco, warmtepomp en cv-ketel specialist in regio Eindhoven.',
     NULL, 3, 320,
     '[{"code":"missing_h1","severity":"high","title":"Geen H1 aanwezig"},{"code":"schema_missing","severity":"medium","title":"Geen Schema markup"},{"code":"meta_generic","severity":"medium","title":"Meta description te generiek"}]'),

    (v_ap_svc, v_audit_id, v_tenant_id, v_page_svc,
     'https://hartmanklimaat.nl/diensten/airco-installatie/', 200,
     'Airco Installatie Eindhoven | Hartman Klimaat',
     'Professionele airco installatie in Eindhoven.',
     'Airco Installatie Eindhoven', 1, 680,
     '[{"code":"images_no_alt","severity":"low","title":"1 afbeelding zonder alt-tekst"}]'),

    (v_ap_loc, v_audit_id, v_tenant_id, v_page_loc,
     'https://hartmanklimaat.nl/diensten/cv-ketel-onderhoud/', 200,
     'CV-ketel Onderhoud | Hartman Klimaat & Sanitair',
     'Betrouwbaar cv-ketel onderhoud in Eindhoven.',
     'CV-ketel Onderhoud Eindhoven', 0, 520,
     '[{"code":"internal_links_low","severity":"medium","title":"Weinig interne links (2)"},{"code":"word_count_low","severity":"medium","title":"Tekst te kort voor SEO (<600 woorden)"}]');

  INSERT INTO public.page_intelligence
    (id, tenant_id, page_id, audit_page_id, audit_id, page_url,
     page_type, intent, commercial_priority, seo_role,
     target_keyword, desired_action, funnel_stage,
     confidence, analyzed_at)
  VALUES
    (v_pi_home, v_tenant_id, v_page_home, v_ap_home, v_audit_id,
     'https://hartmanklimaat.nl/',
     'homepage', 'trust', 'high', 'trust_page',
     'airco installateur eindhoven', 'Bel of vraag offerte aan', 'awareness',
     0.88, now() - interval '2 days'),

    (v_pi_svc, v_tenant_id, v_page_svc, v_ap_svc, v_audit_id,
     'https://hartmanklimaat.nl/diensten/airco-installatie/',
     'service', 'commercial', 'critical', 'rank_target',
     'airco installatie eindhoven', 'Offerte aanvragen', 'conversion',
     0.91, now() - interval '2 days'),

    (v_pi_loc, v_tenant_id, v_page_loc, v_ap_loc, v_audit_id,
     'https://hartmanklimaat.nl/diensten/cv-ketel-onderhoud/',
     'service', 'commercial', 'medium', 'rank_target',
     'cv ketel onderhoud eindhoven', 'Afspraak plannen', 'conversion',
     0.85, now() - interval '2 days');

  RAISE NOTICE '✓ Audit + audit_pages + page_intelligence created';

  -- ── 9. Execution artifacts ────────────────────────────────────
  INSERT INTO public.execution_artifacts
    (id, tenant_id, masterplan_item_id, growth_goal_id,
     artifact_type, status, payload, quality_gates, delivery_readiness)
  VALUES
    -- Item 1: Airco Installatie Eindhoven — PUBLISHED
    (v_artifact_1, v_tenant_id, v_item_1, v_goal_id,
     'page_brief', 'approved',
     '{"primaryKeyword":"airco installatie eindhoven","keywordVolume":2900,"h1":"Airco Installatie in Eindhoven — Snel & Vakkundig","metaTitle":"Airco Installatie Eindhoven | Hartman Klimaat","metaDescription":"Professionele airco installatie in Eindhoven. F-gassen gecertificeerd. Daikin & Mitsubishi dealer. Gratis offerte aanvragen.","introPreview":"Een airco laten installeren in uw woning of bedrijfspand in Eindhoven? Hartman Klimaat & Sanitair is uw erkende specialist in de regio...","sectionCount":6,"faqCount":5}',
     '{"brand_fit":0.92,"seo_fit":0.89,"commercial_fit":0.94}',
     '"inventory_synced"'),

    -- Item 2: Warmtepomp — APPROVED, draft in WP
    (v_artifact_2, v_tenant_id, v_item_2, v_goal_id,
     'page_brief', 'approved',
     '{"primaryKeyword":"warmtepomp installatie eindhoven","keywordVolume":1600,"h1":"Warmtepomp Installatie Eindhoven — Subsidie & Advies","metaTitle":"Warmtepomp Installatie Eindhoven | Hartman Klimaat","metaDescription":"Warmtepomp installateur in Eindhoven. ISDE-subsidie begeleiding. Daikin Altherma specialist. Gratis thuisadvies.","introPreview":"Duurzaam verwarmen met een warmtepomp is slim én haalbaar. Hartman Klimaat begeleidt u van subsidieaanvraag tot en met installatie...","sectionCount":5,"faqCount":4}',
     '{"brand_fit":0.88,"seo_fit":0.91,"commercial_fit":0.87}',
     '"connected"'),

    -- Item 4: Homepage optimalisatie — NEEDS REVIEW
    (v_artifact_3, v_tenant_id, v_item_4, v_goal_id,
     'page_optimization_brief', 'needs_review',
     '{"targetPage":"https://hartmanklimaat.nl/","wpPostId":1,"recommendedH1":"Airco & Warmtepomp Installateur Eindhoven | Hartman Klimaat","recommendedMetaTitle":"Airco & Warmtepomp Eindhoven | Hartman Klimaat & Sanitair","recommendedMetaDescription":"Uw specialist voor airco, warmtepomp en cv-ketel in Eindhoven en omgeving. F-gassen gecertificeerd. Bel 040-1234567.","updateMode":"meta_only","checklist":["H1 toevoegen","Meta title aanpassen","Schema LocalBusiness toevoegen"]}',
     '{"brand_fit":0.90,"seo_fit":0.85,"commercial_fit":0.88}',
     '"connected"');

  RAISE NOTICE '✓ Execution artifacts created';

  -- ── 10. Lead ingestion source ─────────────────────────────────
  INSERT INTO public.lead_ingestion_sources
    (id, tenant_id, site_connection_id, name, source_type,
     public_key, status, default_source, default_status)
  VALUES
    (v_ingestion_id, v_tenant_id, v_conn_id,
     'Website contact formulier', 'form_webhook',
     v_ingestion_key, 'active', 'form', 'new');

  -- ── 11. Leads ─────────────────────────────────────────────────
  INSERT INTO public.leads
    (id, tenant_id, page_id, source, status, name, email, phone,
     closed_amount, close_probability, closed_at, won_notes, created_at)
  VALUES
    (v_lead_1, v_tenant_id, v_page_svc, 'call', 'won',
     'Jan de Boer', null, '06-12345678',
     2850, 1.0, now() - interval '18 days',
     'Airco installatie woonkamer + slaapkamer. Daikin Stylish.',
     now() - interval '22 days'),

    (v_lead_2, v_tenant_id, v_page_svc, 'form', 'won',
     'Sandra Willems', 'sandra.willems@gmail.com', null,
     1400, 1.0, now() - interval '12 days',
     'Warmtepomp advies + installatie. ISDE-subsidie aangevraagd.',
     now() - interval '16 days'),

    (v_lead_3, v_tenant_id, v_page_loc, 'organic', 'won',
     'Kees Bakker', null, '06-98765432',
     380, 1.0, now() - interval '8 days',
     'CV-ketel onderhoud jaarcontract afgesloten.',
     now() - interval '10 days'),

    (v_lead_4, v_tenant_id, v_page_svc, 'form', 'qualified',
     'Marieke van Dijk', 'marieke@vdijk.nl', '06-11223344',
     null, 0.6, null, null,
     now() - interval '4 days'),

    (v_lead_5, v_tenant_id, v_page_home, 'organic', 'qualified',
     'Peter Smit', null, '06-55667788',
     null, 0.5, null, null,
     now() - interval '3 days'),

    (v_lead_6, v_tenant_id, v_page_svc, 'form', 'new',
     'Fatima El Amrani', 'f.elamrani@hotmail.com', null,
     null, null, null, null,
     now() - interval '1 day'),

    (v_lead_7, v_tenant_id, null, 'call', 'new',
     'Thomas Jansen', null, '06-44332211',
     null, null, null, null,
     now() - interval '6 hours');

  -- Lead events for won leads
  INSERT INTO public.lead_events
    (tenant_id, lead_id, event_type, payload)
  VALUES
    (v_tenant_id, v_lead_1, 'status_changed',
     '{"from":"new","to":"qualified","note":"Thuisbezoek gepland"}'),
    (v_tenant_id, v_lead_1, 'status_changed',
     '{"from":"qualified","to":"won","amount":2850}'),
    (v_tenant_id, v_lead_2, 'status_changed',
     '{"from":"new","to":"qualified","note":"Subsidiecheck gedaan"}'),
    (v_tenant_id, v_lead_2, 'status_changed',
     '{"from":"qualified","to":"won","amount":1400}'),
    (v_tenant_id, v_lead_3, 'status_changed',
     '{"from":"new","to":"won","amount":380}'),
    (v_tenant_id, v_lead_6, 'created',
     '{"source":"form","page":"airco-installatie"}'),
    (v_tenant_id, v_lead_7, 'created',
     '{"source":"call","note":"Storing melding, direct doorgestuurd"}');

  RAISE NOTICE '✓ Leads + events created (3 won, 2 qualified, 2 new)';

  -- ── 12. Health scores ─────────────────────────────────────────
  INSERT INTO public.health_scores (tenant_id, category, score, measured_at)
  VALUES
    (v_tenant_id, 'seo',         68, now() - interval '2 days'),
    (v_tenant_id, 'content',     72, now() - interval '2 days'),
    (v_tenant_id, 'technical',   55, now() - interval '2 days'),
    (v_tenant_id, 'local',       81, now() - interval '2 days'),
    (v_tenant_id, 'conversion',  63, now() - interval '2 days');

  -- ── 13. Monthly report ────────────────────────────────────────
  INSERT INTO public.monthly_reports
    (id, tenant_id, growth_goal_id, period_start, period_end, status,
     lead_summary, execution_summary, wordpress_summary,
     goal_progress_summary, next_actions, risks,
     narrative, share_token, share_token_created_at)
  VALUES
    (v_report_id, v_tenant_id, v_goal_id,
     date_trunc('month', now() - interval '1 month')::date,
     (date_trunc('month', now()) - interval '1 day')::date,
     'approved',
     '{"total":7,"won":3,"qualified":2,"new":2,"totalRevenue":4630,"avgLeadValue":1543}',
     '{"pagesPublished":2,"pagesOptimized":0,"artifactsDelivered":2,"artifactsPending":1}',
     '{"draftsCreated":2,"draftsPublished":1,"metaPushed":1}',
     '{"targetLeads":27,"actualLeads":7,"gap":20,"targetClients":8,"actualClients":3,"onTrack":false,"progressPct":38}',
     '[{"action":"Homepage optimalisatie uitvoeren","priority":"high"},{"action":"Airco Tilburg pagina publiceren","priority":"high"},{"action":"Google Post plaatsen","priority":"medium"}]',
     '[{"risk":"Lead volume 38% van target — extra pagina''s urgent","severity":"medium"}]',
     'Mei was een stevige startmaand. De airco-pagina staat live en brengt al verkeer. '
     'De warmtepomp-pagina staat klaar als concept. Homepage-optimalisatie staat voor juni. '
     'Lead volume ligt nog onder target maar de kwaliteit is goed: 3 van 7 leads zijn gewonnen.',
     v_share_token, now() - interval '3 days');

  RAISE NOTICE '✓ Monthly report created';

  -- ── 14. Intelligence run (completed) ──────────────────────────
  INSERT INTO public.intelligence_runs
    (tenant_id, site_id, growth_goal_id, status, current_stage,
     triggered_by, trigger_reason, started_at, completed_at)
  VALUES
    (v_tenant_id, v_conn_id, v_goal_id, 'completed', 'done',
     'operator', 'Initial intelligence run na onboarding',
     now() - interval '5 days',
     now() - interval '5 days' + interval '23 minutes');

  -- ── Done — print credentials ───────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════';
  RAISE NOTICE ' LeadLayer Dev Seed — DONE';
  RAISE NOTICE '════════════════════════════════════════════════════';
  RAISE NOTICE ' Operator login:';
  RAISE NOTICE '   Email:    operator@leadlayer.test';
  RAISE NOTICE '   Tenant:   Hartman Klimaat & Sanitair';
  RAISE NOTICE '   Tenant ID: %', v_tenant_id;
  RAISE NOTICE '';
  RAISE NOTICE ' Client portal (no login needed):';
  RAISE NOTICE '   /portal/%', v_portal_token;
  RAISE NOTICE '';
  RAISE NOTICE ' Monthly report share link:';
  RAISE NOTICE '   /r/%', v_share_token;
  RAISE NOTICE '';
  RAISE NOTICE ' Webhook ingestion key: %', v_ingestion_key;
  RAISE NOTICE '════════════════════════════════════════════════════';

END $$;
