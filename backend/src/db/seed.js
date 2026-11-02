const db = require('./database');
const { scoreCandidate, extractScorecardFromJD } = require('../services/ai_scorer');
const { calculateFileHash } = require('../services/duplicate_detector');
const { logAccess } = require('../services/dpdp_service');

function seedDatabase() {
  console.log('Seeding initial Company A data...');

  // Clear existing data for fresh clean start
  db.exec(`
    DELETE FROM calibration_audits;
    DELETE FROM access_audit_logs;
    DELETE FROM cv_evaluations;
    DELETE FROM candidates;
    DELETE FROM requisitions;
    DELETE FROM users;
  `);

  // 1. Insert Users
  const insertUser = db.prepare(`
    INSERT INTO users (id, email, name, role, company_id, company_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const users = [
    {
      id: 'usr_recruiter_priya',
      email: 'priya@companya.in',
      name: 'Priya Sharma',
      role: 'recruiter',
      company_id: 'comp_a',
      company_name: 'Company A Staffing, Noida'
    },
    {
      id: 'usr_client_vikram',
      email: 'vikram@hdfctech.com',
      name: 'Vikram Malhotra',
      role: 'client_hiring_manager',
      company_id: 'client_hdfc',
      company_name: 'HDFC Tech Platform'
    },
    {
      id: 'usr_client_ananya',
      email: 'ananya@standardchartered.com',
      name: 'Ananya Sen',
      role: 'client_hiring_manager',
      company_id: 'client_stanchart',
      company_name: 'Standard Chartered Global Back-Office'
    },
    {
      id: 'usr_delivery_head_rajesh',
      email: 'rajesh@companya.in',
      name: 'Rajesh Verma',
      role: 'delivery_head',
      company_id: 'comp_a',
      company_name: 'Company A Staffing, Noida'
    }
  ];

  for (const u of users) {
    insertUser.run(u.id, u.email, u.name, u.role, u.company_id, u.company_name);
  }

  // 2. Insert Requisitions with realistic JDs and AI-extracted Scorecards
  const insertReq = db.prepare(`
    INSERT INTO requisitions (
      id, title, department, client_company, client_contact_name, client_user_id,
      status, openings_count, min_exp, max_exp, max_ctc, max_notice_days, location,
      raw_jd, scorecard_json, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const javaRawJd = `Client: HDFC Tech Platform, Noida
Role: Senior Java Developer (Core Banking Microservices)
Experience: 5 to 8 years
Location: Noida (Hybrid - 3 days in office)
Notice Period: Up to 60 days
Budget / Max CTC: ₹24.0 LPA

Key Responsibilities & Must-Have Skills:
- 5+ years of extensive hands-on experience in Java, Spring Boot, and microservices architecture.
- Strong knowledge of REST APIs, Hibernate/JPA, and PostgreSQL/MySQL.
- Hands-on experience with Kafka or RabbitMQ event streaming.
- Familiarity with Docker, Kubernetes, and AWS cloud deployment.
- Clean code practices, TDD, and unit testing with JUnit/Mockito.
- Notice period strictly within 60 days (serving notice or immediate joiners preferred).`;

  const javaScorecard = extractScorecardFromJD(javaRawJd, 'Senior Java Developer');
  // Enhance scorecard with specific must-haves
  javaScorecard.must_have_skills = [
    { name: 'Java', min_years: 5 },
    { name: 'Spring Boot', min_years: 4 },
    { name: 'Microservices', min_years: 3 },
    { name: 'REST APIs', min_years: 3 },
    { name: 'Kafka', min_years: 2 }
  ];
  javaScorecard.weights = { skills: 0.40, experience: 0.30, notice: 0.15, ctc: 0.15 };

  const kycRawJd = `Client: Standard Chartered Global Back-Office, Gurugram
Role: KYC Analyst / AML Operations Specialist
Experience: 2 to 5 years
Location: Gurugram
Notice Period: Up to 30 days
Budget / Max CTC: ₹11.0 LPA

Key Responsibilities:
- Conduct end-to-end KYC and AML checks for institutional and corporate banking clients.
- Verify customer due diligence (CDD) documents and execute PEP screening and sanctions monitoring.
- Deep expertise in Advanced Excel (VLOOKUP, pivot tables, macros) and AML reporting.
- Strong communication skills to liaise with compliance officers and frontline relationship managers.`;

  const kycScorecard = extractScorecardFromJD(kycRawJd, 'KYC Analyst');
  kycScorecard.must_have_skills = [
    { name: 'KYC', min_years: 2 },
    { name: 'AML checks', min_years: 2 },
    { name: 'Excel', min_years: 2 },
    { name: 'Customer Due Diligence', min_years: 1 }
  ];
  kycScorecard.weights = { skills: 0.45, experience: 0.25, notice: 0.20, ctc: 0.10 };

  const retailRawJd = `Client: Reliance Retail, Noida Sector 18
Role: Retail Store Operations Lead
Experience: 3 to 6 years
Location: Noida
Notice Period: Up to 45 days
Budget / Max CTC: ₹14.0 LPA

Key Responsibilities:
- Supervise daily store operations, inventory management, replenishment, and audits.
- Manage POS systems, billing compliance, cash management, and shrink loss prevention.
- Coordinate with vendors and logistics partners to ensure timely product distribution.
- Lead a team of 15 retail sales associates and department floor supervisors.`;

  const retailScorecard = extractScorecardFromJD(retailRawJd, 'Retail Store Operations Lead');
  retailScorecard.must_have_skills = [
    { name: 'Retail Store Operations', min_years: 3 },
    { name: 'Inventory Management', min_years: 2 },
    { name: 'POS Systems', min_years: 2 },
    { name: 'Vendor Management', min_years: 2 }
  ];

  insertReq.run(
    'REQ-2026-081',
    'Senior Java Developer',
    'Core Banking Microservices',
    'HDFC Tech Platform',
    'Vikram Malhotra',
    'usr_client_vikram',
    'active',
    3,
    5.0,
    8.0,
    24.0,
    60,
    'Noida',
    javaRawJd,
    JSON.stringify(javaScorecard),
    'usr_recruiter_priya'
  );

  insertReq.run(
    'REQ-2026-082',
    'KYC Analyst',
    'AML Operations & Compliance',
    'Standard Chartered Global Back-Office',
    'Ananya Sen',
    'usr_client_ananya',
    'active',
    5,
    2.0,
    5.0,
    11.0,
    30,
    'Gurugram',
    kycRawJd,
    JSON.stringify(kycScorecard),
    'usr_recruiter_priya'
  );

  insertReq.run(
    'REQ-2026-083',
    'Retail Store Operations Lead',
    'Store Retail Ops & Inventory',
    'Reliance Retail',
    'Rohit Khurana',
    null,
    'shortlisting',
    2,
    3.0,
    6.0,
    14.0,
    45,
    'Noida',
    retailRawJd,
    JSON.stringify(retailScorecard),
    'usr_recruiter_priya'
  );

  // 3. Insert Realistic Candidate CVs with Rich Text & Exact Quotes
  const insertCandidate = db.prepare(`
    INSERT INTO candidates (
      id, name, email, phone, current_role, total_exp_years,
      key_skills_json, current_ctc, expected_ctc, notice_period_days,
      location, raw_cv_text, original_filename, file_hash,
      consent_status, consent_date, consent_purpose
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const candidatesData = [
    {
      id: 'CND-91022',
      name: 'Ritika Bansal',
      email: 'ritika.bansal92@gmail.com',
      phone: '+91 98112 45890',
      current_role: 'Senior Java Developer',
      total_exp_years: 6.5,
      key_skills: ['Java', 'Spring Boot', 'Microservices', 'REST APIs', 'Kafka', 'Docker', 'PostgreSQL'],
      current_ctc: 18.0,
      expected_ctc: 22.5,
      notice_period_days: 60,
      location: 'Noida',
      filename: 'Ritika_Bansal_Senior_Java_CV.pdf',
      text: `RITIKA BANSAL
Noida, Uttar Pradesh | ritika.bansal92@gmail.com | +91 98112 45890

PROFESSIONAL SUMMARY
Senior Java Developer with 6.5 years of experience architecting resilient financial microservices and distributed transaction pipelines. Expert in Java 17, Spring Boot, event-driven architectures with Kafka, and containerized cloud workloads.

WORK EXPERIENCE
Senior Software Engineer | PayFintech Solutions, Noida (2021 - Present | 3.5 yrs)
- Engineered scalable microservices architecture in Java and Spring Boot processing 2.4M transactions daily.
- Built high-throughput REST APIs and integrated Apache Kafka clusters for asynchronous payment webhooks.
- Migrated legacy monolithic services to containerized Docker pods managed in Kubernetes clusters.
- Optimized PostgreSQL database queries, reducing checkout API latency by 38%.

Software Engineer | Cognizant Technology Solutions, Gurugram (2019 - 2021 | 2 yrs)
- Developed enterprise Java modules with Spring Boot, Hibernate, and Oracle database.
- Implemented OAuth2 and JWT token authentication securing customer-facing REST endpoints.

Junior Developer | Infosys Ltd (2017 - 2019 | 1 yr)
- Worked on core Java application development, bug fixes, and JUnit test suites.

EDUCATION
B.Tech in Computer Science, Jaypee Institute of Information Technology, Noida (2017)

AVAILABILITY & COMPENSATION
Notice Period: Currently serving notice period, 60 days remaining (negotiable for prompt buyout).
Current CTC: ₹18.0 LPA | Expected CTC: ₹22.5 LPA`
    },
    {
      id: 'CND-91047',
      name: 'Arjun Rawat',
      email: 'arjun.rawat.aml@outlook.com',
      phone: '+91 98710 33412',
      current_role: 'KYC Analyst',
      total_exp_years: 3.0,
      key_skills: ['KYC', 'AML checks', 'Customer Due Diligence', 'Excel', 'PEP Screening', 'Sanctions'],
      current_ctc: 6.5,
      expected_ctc: 9.0,
      notice_period_days: 30,
      location: 'Gurugram',
      filename: 'Arjun_Rawat_KYC_Analyst_2026.docx',
      text: `ARJUN RAWAT
Gurugram, Haryana | arjun.rawat.aml@outlook.com | +91 98710 33412

CAREER PROFILE
KYC Analyst with 3.0 years of hands-on expertise in banking compliance, anti-money laundering (AML) controls, and enhanced customer due diligence (EDD) for institutional clients.

PROFESSIONAL EXPERIENCE
KYC Operations Analyst | HSBC Global Service Centre, Gurugram (2023 - Present)
- Conducted comprehensive KYC and AML checks for over 450 corporate entities across APAC jurisdictions.
- Performed rigorous PEP screening and sanctions list validation against World-Check and OFAC registries.
- Utilized Advanced Excel with VLOOKUP, pivot tables, and conditional nested formulas to generate daily compliance dashboards.
- Reduced onboarding audit remediation cycles by 24% through meticulous document verification.

Junior Compliance Associate | Genpact India, Noida (2021 - 2023)
- Managed Customer Due Diligence (CDD) records and verified beneficial ownership structures.
- Flagged suspicious transaction alerts to senior compliance investigators.

EDUCATION & CERTIFICATIONS
B.Com (Hons), Delhi University (2021)
Certified Anti-Money Laundering Specialist (CAMS - Coursework)

PERSONAL DETAILS
Notice Period: 30 days notice period.
Current CTC: ₹6.5 LPA | Expected CTC: ₹9.0 LPA`
    },
    {
      id: 'CND-91088',
      name: 'Pooja Nair',
      email: 'pooja.nair.dev@yahoo.com',
      phone: '+91 99580 87612',
      current_role: 'Java Developer',
      total_exp_years: 4.0,
      key_skills: ['Java', 'Hibernate', 'REST APIs', 'Spring Framework', 'MySQL', 'Git'],
      current_ctc: 11.5,
      expected_ctc: 15.0,
      notice_period_days: 90,
      location: 'Delhi NCR',
      filename: 'Pooja_Nair_Java_Resume.pdf',
      text: `POOJA NAIR
Delhi NCR | pooja.nair.dev@yahoo.com | +91 99580 87612

OBJECTIVE
Motivated Java Developer with 4.0 years of experience designing robust REST APIs and relational database layers.

TECHNICAL STACK
Languages: Java 11, SQL
Frameworks: Spring MVC, Hibernate ORM, REST APIs
Databases: MySQL, PostgreSQL
Tools: Git, Jenkins, Postman

PROFESSIONAL SUMMARY
Software Engineer | Wipro Technologies, Greater Noida (2022 - Present)
- Built enterprise Java backend services and integrated Hibernate ORM mappings for telecom billing.
- Developed and documented REST APIs consumed by internal partner portals.
- Participated in daily agile sprints, code reviews, and defect triage meetings.

Associate Software Engineer | HCL Technologies, Noida (2020 - 2022)
- Maintained core Java modules and fixed legacy batch processing bottlenecks.

EDUCATION
B.Sc in Information Technology, Amity University (2020)

AVAILABILITY
Notice Period: 90 days as per company policy (non-negotiable).
Current CTC: ₹11.5 LPA | Expected CTC: ₹15.0 LPA`
    },
    {
      id: 'CND-91120',
      name: 'Neha Saxena',
      email: 'neha.saxena.tech@gmail.com',
      phone: '+91 98105 99432',
      current_role: 'Senior Java Backend Engineer',
      total_exp_years: 5.5,
      key_skills: ['Java', 'Spring Boot', 'Microservices', 'REST APIs', 'Kafka', 'Docker', 'AWS'],
      current_ctc: 19.5,
      expected_ctc: 23.0,
      notice_period_days: 15,
      location: 'Noida',
      filename: 'Neha_Saxena_Java_Spring_2026.pdf',
      text: `NEHA SAXENA
Noida Sector 62 | neha.saxena.tech@gmail.com | +91 98105 99432

EXECUTIVE SUMMARY
Senior Java Backend Engineer with 5.5 years of deep expertise in Spring Boot, Kafka, and cloud microservices. Proven record in architecting low-latency payment processing APIs.

EXPERIENCE
Senior Software Engineer | Paytm Payments Bank, Noida (2022 - Present | 3.5 yrs)
- Led development of Spring Boot microservices handling 15,000 requests per minute with 99.98% uptime.
- Implemented Apache Kafka pipelines for distributed transactional events and settlement reconciliation.
- Engineered secure REST APIs with rate-limiting, circuit breakers (Resilience4j), and Docker deployments.

Software Developer | Tata Consultancy Services (2019 - 2022 | 2 yrs)
- Developed Java microservices and RESTful backends for international retail banking client.

EDUCATION
B.E. in Computer Science, Delhi Technological University (DTU) (2019)

DETAILS
Notice Period: 15 days (Serving notice period, immediate joiner ready).
Current CTC: ₹19.5 LPA | Expected CTC: ₹23.0 LPA`
    },
    {
      id: 'CND-91105',
      name: 'Rohan Mehra',
      email: 'rohan.mehra.architect@gmail.com',
      phone: '+91 98200 44102',
      current_role: 'Lead Backend Architect',
      total_exp_years: 10.5,
      key_skills: ['Java', 'Spring Boot', 'Microservices', 'Kafka', 'Kubernetes', 'AWS', 'System Design'],
      current_ctc: 32.0,
      expected_ctc: 38.0,
      notice_period_days: 30,
      location: 'Gurugram',
      filename: 'Rohan_Mehra_Lead_Architect.pdf',
      text: `ROHAN MEHRA
Gurugram | rohan.mehra.architect@gmail.com | +91 98200 44102

PROFILE
Lead Backend Architect with 10.5 years driving enterprise distributed systems, cloud migrations, and high-frequency trading platforms.

EXPERIENCE
Principal Architect | Global Investment Bank, Gurugram (2020 - Present)
- Architected enterprise cloud infrastructure in Java, Spring Boot, and Kubernetes.
- Spearheaded team of 25 backend engineers across distributed microservices.

Lead Engineer | Fidelity Investments (2016 - 2020)
- Engineered low-latency order routing systems in Java and Kafka.

COMPENSATION & NOTICE
Notice: 30 days.
Current CTC: ₹32.0 LPA | Expected CTC: ₹38.0 LPA`
    },
    {
      id: 'CND-91135',
      name: 'Vikas Gupta',
      email: 'vikas.gupta.junior@gmail.com',
      phone: '+91 97180 22345',
      current_role: 'Junior Java Programmer',
      total_exp_years: 2.0,
      key_skills: ['Java', 'Spring Boot', 'MySQL', 'Git'],
      current_ctc: 5.5,
      expected_ctc: 8.0,
      notice_period_days: 60,
      location: 'Noida',
      filename: 'Vikas_Gupta_CV.pdf',
      text: `VIKAS GUPTA
Noida | vikas.gupta.junior@gmail.com | +91 97180 22345

SUMMARY
Junior Java Programmer with 2.0 years of experience building simple REST endpoints and maintaining MySQL databases.

EXPERIENCE
Junior Programmer | AppSquadz Technologies, Noida (2024 - Present | 2 yrs)
- Assisted senior developers in writing Java and basic Spring Boot controllers.
- Executed unit tests and bug fixes.

EDUCATION
B.Tech IT, Galgotias University (2024)

Notice Period: 60 days.
Current CTC: ₹5.5 LPA | Expected CTC: ₹8.0 LPA`
    },
    {
      id: 'CND-91150',
      name: 'Amitav Sen',
      email: 'amitav.sen.dev@gmail.com',
      phone: '+91 99110 55432',
      current_role: 'Java Backend Developer',
      total_exp_years: 6.0,
      key_skills: ['Java', 'Spring Boot', 'Microservices', 'REST APIs', 'PostgreSQL'],
      current_ctc: 16.0,
      expected_ctc: 20.0,
      notice_period_days: 90, // Note: Not declared in CV text below to demonstrate AI uncertainty detection!
      location: 'Noida',
      filename: 'Amitav_Sen_Resume.pdf',
      text: `AMITAV SEN
Noida Sector 50 | amitav.sen.dev@gmail.com | +91 99110 55432

SUMMARY
Java Backend Developer with 6.0 years of experience in enterprise banking and microservices.

PROFESSIONAL EXPERIENCE
Software Engineer | Nagarro, Noida (2020 - Present)
- Developed Java and Spring Boot microservices for tier-1 European banks.
- Designed secure REST APIs with token validation and PostgreSQL database schemas.

EDUCATION
B.E. Computer Science, AKTU (2020)

COMPENSATION
Current CTC: ₹16.0 LPA | Expected CTC: ₹20.0 LPA
(Notice period is not mentioned in this resume - candidate omits availability)`
    }
  ];

  for (const c of candidatesData) {
    const fileHash = calculateFileHash(c.text);
    insertCandidate.run(
      c.id,
      c.name,
      c.email,
      c.phone,
      c.current_role,
      c.total_exp_years,
      JSON.stringify(c.key_skills),
      c.current_ctc,
      c.expected_ctc,
      c.notice_period_days,
      c.location,
      c.text,
      c.filename,
      fileHash,
      'consented',
      '2026-09-15 10:30:00',
      'Hiring evaluation for Company A client requisitions under DPDP Act 2023'
    );
  }

  // 4. Run AI Evaluation for Java Requisition Candidates and KYC candidates
  const insertEval = db.prepare(`
    INSERT INTO cv_evaluations (
      id, requisition_id, candidate_id, overall_score, skills_score, exp_score,
      notice_score, ctc_score, breakdown_json, ai_confidence, uncertainty_notes,
      recruiter_verified, recruiter_verified_at, recruiter_verified_by, recruiter_notes,
      pipeline_stage, rejection_reason, rejection_notes, client_feedback_notes,
      client_action_at, interview_slots_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Evaluate candidates against Java requisition REQ-2026-081
  const javaCandidates = ['CND-91022', 'CND-91120', 'CND-91088', 'CND-91105', 'CND-91135', 'CND-91150', 'CND-91047'];
  
  for (const cid of javaCandidates) {
    const candidate = candidatesData.find(c => c.id === cid);
    const evalResult = scoreCandidate(candidate, javaScorecard, { blindScreening: true });

    let stage = 'ai_screened';
    let recruiterVerified = 0;
    let recruiterVerifiedAt = null;
    let recruiterVerifiedBy = null;
    let recruiterNotes = null;
    let clientFeedback = null;
    let clientActionAt = null;
    let interviewSlots = null;
    let rejectionReason = null;

    if (cid === 'CND-91022') {
      // Ritika Bansal: Verified by recruiter and submitted to client!
      stage = 'submitted_to_client';
      recruiterVerified = 1;
      recruiterVerifiedAt = '2026-10-28 14:20:00';
      recruiterVerifiedBy = 'Priya Sharma';
      recruiterNotes = 'High-depth technical fit. Verified 6.5 yrs Java/Spring experience on phone. Candidate confirmed buyout possible.';
    } else if (cid === 'CND-91120') {
      // Neha Saxena: Client reviewed and Shortlisted with interview slot!
      stage = 'client_shortlisted';
      recruiterVerified = 1;
      recruiterVerifiedAt = '2026-10-27 11:15:00';
      recruiterVerifiedBy = 'Priya Sharma';
      recruiterNotes = 'Immediate 15-day notice joiner. Strong Kafka and microservices experience.';
      clientFeedback = 'Strong candidate profile. Clean microservices background.';
      clientActionAt = '2026-10-29 16:30:00';
      interviewSlots = JSON.stringify([
        { date: '2026-11-05', time: '14:00 IST', round: 'Technical Round 1' },
        { date: '2026-11-06', time: '16:30 IST', round: 'Technical Round 1 (Alt)' }
      ]);
    } else if (cid === 'CND-91088') {
      // Pooja Nair: Low scorer (71%), stays searchable! Not auto-rejected.
      stage = 'ai_screened';
      recruiterVerified = 0;
      recruiterNotes = 'Notice period of 90 days is a risk. Client prefers 60. Kept on warm bench.';
    } else if (cid === 'CND-91047') {
      // Arjun Rawat: Low score for Java dev (evaluated to demonstrate non-auto rejection)
      stage = 'ai_screened';
      recruiterVerified = 0;
    }

    insertEval.run(
      `eval_081_${cid}`,
      'REQ-2026-081',
      cid,
      evalResult.overall_score,
      evalResult.skills_score,
      evalResult.exp_score,
      evalResult.notice_score,
      evalResult.ctc_score,
      JSON.stringify(evalResult.breakdown),
      evalResult.ai_confidence,
      evalResult.uncertainty_notes,
      recruiterVerified,
      recruiterVerifiedAt,
      recruiterVerifiedBy,
      recruiterNotes,
      stage,
      rejectionReason,
      null,
      clientFeedback,
      clientActionAt,
      interviewSlots
    );
  }

  // Also evaluate Arjun Rawat for KYC requisition REQ-2026-082
  const arjunCand = candidatesData.find(c => c.id === 'CND-91047');
  const kycEvalResult = scoreCandidate(arjunCand, kycScorecard, { blindScreening: true });
  insertEval.run(
    'eval_082_CND-91047',
    'REQ-2026-082',
    'CND-91047',
    kycEvalResult.overall_score,
    kycEvalResult.skills_score,
    kycEvalResult.exp_score,
    kycEvalResult.notice_score,
    kycEvalResult.ctc_score,
    JSON.stringify(kycEvalResult.breakdown),
    kycEvalResult.ai_confidence,
    kycEvalResult.uncertainty_notes,
    1,
    '2026-10-26 10:00:00',
    'Priya Sharma',
    'Excellent KYC & Excel skills, ready to join in 30 days.',
    'interview_scheduled',
    null,
    null,
    'Shortlisted for AML Ops Team lead interview',
    '2026-10-27 15:00:00',
    JSON.stringify([
      { date: '2026-11-04', time: '11:00 IST', round: 'Managerial & Compliance Round' }
    ])
  );

  // 5. Seed Calibration Audits for Delivery Head (Weekly Samples)
  const insertAudit = db.prepare(`
    INSERT INTO calibration_audits (
      id, week_label, requisition_id, candidate_id, ai_rank, recruiter_rank,
      discrepancy_score, agreement_status, recruiter_override_reason, audited_by, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const calibrationSamples = [
    {
      id: 'cal_w42_01',
      week_label: 'Week 42 (Oct 12-18)',
      requisition_id: 'REQ-2026-081',
      candidate_id: 'CND-91120',
      ai_rank: 1,
      recruiter_rank: 1,
      discrepancy_score: 0.0,
      agreement_status: 'aligned',
      recruiter_override_reason: 'Full agreement. Candidate has stellar Kafka experience and 15-day notice.',
      audited_by: 'Rajesh Verma',
      created_at: '2026-10-19 11:00:00'
    },
    {
      id: 'cal_w42_02',
      week_label: 'Week 42 (Oct 12-18)',
      requisition_id: 'REQ-2026-081',
      candidate_id: 'CND-91022',
      ai_rank: 2,
      recruiter_rank: 2,
      discrepancy_score: 0.0,
      agreement_status: 'aligned',
      recruiter_override_reason: 'Full agreement. Ritika verified for HDFC Tech platform.',
      audited_by: 'Rajesh Verma',
      created_at: '2026-10-19 11:15:00'
    },
    {
      id: 'cal_w43_01',
      week_label: 'Week 43 (Oct 19-25)',
      requisition_id: 'REQ-2026-081',
      candidate_id: 'CND-91105',
      ai_rank: 4,
      recruiter_rank: 5,
      discrepancy_score: 1.0,
      agreement_status: 'minor_discrepancy',
      recruiter_override_reason: 'Recruiter downranked candidate due to ₹38 LPA CTC expectation exceeding client budget ceiling.',
      audited_by: 'Rajesh Verma',
      created_at: '2026-10-26 14:00:00'
    },
    {
      id: 'cal_w43_02',
      week_label: 'Week 43 (Oct 19-25)',
      requisition_id: 'REQ-2026-081',
      candidate_id: 'CND-91088',
      ai_rank: 3,
      recruiter_rank: 4,
      discrepancy_score: 1.0,
      agreement_status: 'minor_discrepancy',
      recruiter_override_reason: 'Recruiter paused candidate pending notice period reduction discussion.',
      audited_by: 'Rajesh Verma',
      created_at: '2026-10-26 14:30:00'
    },
    {
      id: 'cal_w44_01',
      week_label: 'Week 44 (Oct 26-Nov 01)',
      requisition_id: 'REQ-2026-082',
      candidate_id: 'CND-91047',
      ai_rank: 1,
      recruiter_rank: 1,
      discrepancy_score: 0.0,
      agreement_status: 'aligned',
      recruiter_override_reason: 'Full agreement. Arjun matched KYC/AML skills and joined client interview pipeline.',
      audited_by: 'Rajesh Verma',
      created_at: '2026-11-01 10:00:00'
    }
  ];

  for (const cal of calibrationSamples) {
    insertAudit.run(
      cal.id,
      cal.week_label,
      cal.requisition_id,
      cal.candidate_id,
      cal.ai_rank,
      cal.recruiter_rank,
      cal.discrepancy_score,
      cal.agreement_status,
      cal.recruiter_override_reason,
      cal.audited_by,
      cal.created_at
    );
  }

  // 6. Seed Access Audit Logs for DPDP
  logAccess({
    userId: 'usr_recruiter_priya',
    userName: 'Priya Sharma',
    userRole: 'recruiter',
    candidateId: 'CND-91022',
    requisition_id: 'REQ-2026-081',
    action: 'view_unmasked_cv',
    details: { reason: 'Pre-submission qualification phone interview' }
  });

  logAccess({
    userId: 'usr_recruiter_priya',
    userName: 'Priya Sharma',
    userRole: 'recruiter',
    candidateId: 'CND-91022',
    requisition_id: 'REQ-2026-081',
    action: 'stage_change',
    details: { from: 'recruiter_verified', to: 'submitted_to_client' }
  });

  logAccess({
    userId: 'usr_client_vikram',
    userName: 'Vikram Malhotra',
    userRole: 'client_hiring_manager',
    candidateId: 'CND-91022',
    requisition_id: 'REQ-2026-081',
    action: 'view_masked_card',
    details: { client_portal_session: 'HDFC Tech Platform' }
  });

  console.log('Seeding completed successfully!');
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
