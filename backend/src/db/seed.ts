import db from './database';
import { scoreCandidate, extractScorecardFromJD } from '../services/ai_scorer';
import { calculateFileHash } from '../services/duplicate_detector';
import { logAccess } from '../services/dpdp_service';
import { hashPassword, DEMO_PASSWORD } from '../services/auth_service';

interface SeedEvaluationState {
  stage?: string;
  verified?: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
  recruiterNotes?: string;
  rejectionReason?: string;
  rejectionNotes?: string;
  clientFeedback?: string;
  clientActionAt?: string;
  interviewSlots?: Array<{ date: string; time: string; round: string; interviewer?: string }>;
}

function seedDatabase() {
  const runSeed = db.transaction(() => {
    db.exec(`
      DELETE FROM sessions;
      DELETE FROM calibration_audits;
      DELETE FROM access_audit_logs;
      DELETE FROM cv_evaluations;
      DELETE FROM candidates;
      DELETE FROM requisitions;
      DELETE FROM users;
    `);

    const insertUser = db.prepare(`
      INSERT INTO users (id, email, name, role, company_id, company_name, password_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const passwordHash = hashPassword(DEMO_PASSWORD);
    const users = [
      ['usr_recruiter_priya', 'priya@companya.in', 'Priya Sharma', 'recruiter', 'comp_a', 'Company A Staffing, Noida'],
      ['usr_client_vikram', 'vikram@hdfctech.com', 'Vikram Malhotra', 'client_hiring_manager', 'client_hdfc', 'HDFC Tech Platform'],
      ['usr_client_ananya', 'ananya@standardchartered.com', 'Ananya Sen', 'client_hiring_manager', 'client_stanchart', 'Standard Chartered Global Back-Office'],
      ['usr_delivery_head_rajesh', 'rajesh@companya.in', 'Rajesh Verma', 'delivery_head', 'comp_a', 'Company A Staffing, Noida']
    ];
    for (const user of users) insertUser.run(...user, passwordHash);

    const insertReq = db.prepare(`
      INSERT INTO requisitions (
        id, title, department, client_company, client_contact_name, client_user_id,
        status, openings_count, min_exp, max_exp, max_ctc, max_notice_days, location,
        raw_jd, scorecard_json, created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const javaJd = `Client: HDFC Tech Platform, Noida
Role: Senior Java Developer (Core Banking Microservices)
Experience: 5 to 8 years
Location: Noida (Hybrid — 3 days in office)
Notice Period: Up to 60 days
Budget / Max CTC: ₹24.0 LPA

Key responsibilities and must-have skills:
- 5+ years of hands-on experience in Java, Spring Boot and microservices architecture.
- Strong knowledge of REST APIs, Hibernate/JPA and PostgreSQL/MySQL.
- Hands-on experience with Kafka or RabbitMQ event streaming.
- Familiarity with Docker, Kubernetes and AWS deployment.
- Clean code, TDD and unit testing with JUnit/Mockito.
- Notice period strictly within 60 days; immediate joiners preferred.`;

    const kycJd = `Client: Standard Chartered Global Back-Office, Gurugram
Role: KYC Analyst / AML Operations Specialist
Experience: 2 to 5 years
Location: Gurugram
Notice Period: Up to 30 days
Budget / Max CTC: ₹11.0 LPA

Key responsibilities:
- Conduct end-to-end KYC and AML checks for institutional and corporate banking clients.
- Verify customer due diligence documents and run PEP and sanctions screening.
- Strong Excel skills (VLOOKUP, pivot tables) and AML reporting.
- Liaise with compliance officers and frontline relationship managers.`;

    const retailJd = `Client: Reliance Retail, Noida Sector 18
Role: Retail Store Operations Lead
Experience: 3 to 6 years
Location: Noida
Notice Period: Up to 45 days
Budget / Max CTC: ₹14.0 LPA

Key responsibilities:
- Supervise daily store operations, inventory management and stock audits.
- Manage POS systems, billing compliance, cash management and loss prevention.
- Coordinate with vendors and logistics partners.
- Lead a team of 15 retail sales associates.`;

    const javaScorecard = extractScorecardFromJD(javaJd, 'Senior Java Developer');
    javaScorecard.must_have_skills = [
      { name: 'Java', min_years: 5 },
      { name: 'Spring Boot', min_years: 4 },
      { name: 'Microservices', min_years: 3 },
      { name: 'REST APIs', min_years: 3 },
      { name: 'Kafka', min_years: 2 }
    ];
    javaScorecard.weights = { skills: 0.4, experience: 0.3, notice: 0.15, ctc: 0.15 };

    const kycScorecard = extractScorecardFromJD(kycJd, 'KYC Analyst');
    kycScorecard.must_have_skills = [
      { name: 'KYC', min_years: 2 },
      { name: 'AML checks', min_years: 2 },
      { name: 'Excel', min_years: 2 },
      { name: 'Customer Due Diligence', min_years: 1 }
    ];
    kycScorecard.weights = { skills: 0.45, experience: 0.25, notice: 0.2, ctc: 0.1 };

    const retailScorecard = extractScorecardFromJD(retailJd, 'Retail Store Operations Lead');
    retailScorecard.must_have_skills = [
      { name: 'Retail Store Operations', min_years: 3 },
      { name: 'Inventory Management', min_years: 2 },
      { name: 'POS Systems', min_years: 2 },
      { name: 'Vendor Management', min_years: 2 }
    ];

    insertReq.run('REQ-2026-081', 'Senior Java Developer', 'Core Banking Microservices', 'HDFC Tech Platform', 'Vikram Malhotra', 'usr_client_vikram', 'active', 3, 5, 8, 24, 60, 'Noida', javaJd, JSON.stringify(javaScorecard), 'usr_recruiter_priya');
    insertReq.run('REQ-2026-082', 'KYC Analyst', 'AML Operations & Compliance', 'Standard Chartered Global Back-Office', 'Ananya Sen', 'usr_client_ananya', 'active', 5, 2, 5, 11, 30, 'Gurugram', kycJd, JSON.stringify(kycScorecard), 'usr_recruiter_priya');
    insertReq.run('REQ-2026-083', 'Retail Store Operations Lead', 'Store Retail Ops & Inventory', 'Reliance Retail', 'Rohit Khurana', null, 'shortlisting', 2, 3, 6, 14, 45, 'Noida', retailJd, JSON.stringify(retailScorecard), 'usr_recruiter_priya');

    const insertCandidate = db.prepare(`
      INSERT INTO candidates (
        id, name, email, phone, current_role, total_exp_years,
        key_skills_json, current_ctc, expected_ctc, notice_period_days,
        location, raw_cv_text, original_filename, file_hash,
        consent_status, consent_date, consent_purpose
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'consented', ?, ?)
    `);

    const candidates = [
      {
        id: 'CND-91022',
        name: 'Ritika Bansal',
        email: 'ritika.bansal92@gmail.com',
        phone: '+91 98112 45890',
        role: 'Senior Java Developer',
        exp: 6.5,
        skills: ['Java', 'Spring Boot', 'Microservices', 'REST APIs', 'Kafka', 'Docker', 'PostgreSQL'],
        currentCtc: 18,
        expectedCtc: 22.5,
        notice: 60,
        location: 'Noida',
        filename: 'Ritika_Bansal_Senior_Java_CV.pdf',
        text: `RITIKA BANSAL
Noida, Uttar Pradesh | ritika.bansal92@gmail.com | +91 98112 45890

PROFESSIONAL SUMMARY
Senior Java Developer with 6.5 years of experience building financial microservices and distributed transaction pipelines. Expert in Java 17, Spring Boot, event-driven architecture with Kafka and containerised cloud workloads.

WORK EXPERIENCE
Senior Software Engineer | PayFintech Solutions, Noida (2021 — Present, 3.5 yrs)
- Engineered scalable microservices in Java and Spring Boot processing 2.4M transactions daily.
- Built high-throughput REST APIs and Apache Kafka pipelines for asynchronous payment webhooks.
- Migrated legacy monoliths to Docker containers managed in Kubernetes.
- Optimised PostgreSQL queries, reducing checkout API latency by 38%.

Software Engineer | Cognizant Technology Solutions, Gurugram (2019 — 2021, 2 yrs)
- Developed enterprise Java modules with Spring Boot, Hibernate and Oracle.
- Implemented OAuth2 and JWT authentication for customer-facing REST endpoints.

EDUCATION
B.Tech in Computer Science, Jaypee Institute of Information Technology, Noida (2017)

AVAILABILITY
Notice Period: Serving notice, 60 days remaining.
Current CTC: ₹18.0 LPA | Expected CTC: ₹22.5 LPA`
      },
      {
        id: 'CND-91047',
        name: 'Arjun Rawat',
        email: 'arjun.rawat.aml@outlook.com',
        phone: '+91 98710 33412',
        role: 'KYC Analyst',
        exp: 3,
        skills: ['KYC', 'AML checks', 'Customer Due Diligence', 'Excel', 'PEP Screening', 'Sanctions'],
        currentCtc: 6.5,
        expectedCtc: 9,
        notice: 30,
        location: 'Gurugram',
        filename: 'Arjun_Rawat_KYC_Analyst_2026.docx',
        text: `ARJUN RAWAT
Gurugram, Haryana | arjun.rawat.aml@outlook.com | +91 98710 33412

CAREER PROFILE
KYC Analyst with 3.0 years of hands-on experience in banking compliance, anti-money laundering controls and enhanced customer due diligence for institutional clients.

PROFESSIONAL EXPERIENCE
KYC Operations Analyst | HSBC Global Service Centre, Gurugram (2023 — Present)
- Conducted comprehensive KYC and AML checks for over 450 corporate entities across APAC.
- Performed PEP screening and sanctions validation against World-Check and OFAC registries.
- Used Advanced Excel with VLOOKUP, pivot tables and nested formulas for daily compliance dashboards.
- Reduced onboarding remediation cycles by 24%.

Junior Compliance Associate | Genpact India, Noida (2021 — 2023)
- Managed Customer Due Diligence records and verified beneficial ownership structures.

EDUCATION & CERTIFICATIONS
B.Com (Hons), Delhi University (2021)
Certified Anti-Money Laundering Specialist (CAMS coursework)

AVAILABILITY
Notice Period: 30 days.
Current CTC: ₹6.5 LPA | Expected CTC: ₹9.0 LPA`
      },
      {
        id: 'CND-91088',
        name: 'Pooja Nair',
        email: 'pooja.nair.dev@yahoo.com',
        phone: '+91 99580 87612',
        role: 'Java Developer',
        exp: 4,
        skills: ['Java', 'Hibernate', 'REST APIs', 'Spring Framework', 'MySQL', 'Git'],
        currentCtc: 11.5,
        expectedCtc: 15,
        notice: 90,
        location: 'Delhi NCR',
        filename: 'Pooja_Nair_Java_Resume.pdf',
        text: `POOJA NAIR
Delhi NCR | pooja.nair.dev@yahoo.com | +91 99580 87612

OBJECTIVE
Motivated Java Developer with 4.0 years of experience designing REST APIs and relational database layers.

TECHNICAL STACK
Languages: Java 11, SQL
Frameworks: Spring MVC, Hibernate ORM, REST APIs
Databases: MySQL, PostgreSQL
Tools: Git, Jenkins, Postman

EXPERIENCE
Software Engineer | Wipro Technologies, Greater Noida (2022 — Present)
- Built enterprise Java backend services and integrated Hibernate ORM mappings for telecom billing.
- Developed and documented REST APIs consumed by internal partner portals.

Associate Software Engineer | HCL Technologies, Noida (2020 — 2022)
- Maintained core Java modules and fixed legacy batch processing bottlenecks.

EDUCATION
B.Sc in Information Technology, Amity University (2020)

AVAILABILITY
Notice Period: 90 days as per company policy (non-negotiable).
Current CTC: ₹11.5 LPA | Expected CTC: ₹15.0 LPA`
      },
      {
        id: 'CND-91105',
        name: 'Rohan Mehra',
        email: 'rohan.mehra.architect@gmail.com',
        phone: '+91 98200 44102',
        role: 'Lead Backend Architect',
        exp: 10.5,
        skills: ['Java', 'Spring Boot', 'Microservices', 'Kafka', 'Kubernetes', 'AWS', 'System Design'],
        currentCtc: 32,
        expectedCtc: 38,
        notice: 30,
        location: 'Gurugram',
        filename: 'Rohan_Mehra_Lead_Architect.pdf',
        text: `ROHAN MEHRA
Gurugram | rohan.mehra.architect@gmail.com | +91 98200 44102

PROFILE
Lead Backend Architect with 10.5 years driving enterprise distributed systems, cloud migrations and high-frequency trading platforms.

EXPERIENCE
Principal Architect | Global Investment Bank, Gurugram (2020 — Present)
- Architected enterprise cloud infrastructure in Java, Spring Boot and Kubernetes.
- Led a team of 25 backend engineers across distributed microservices.
- Designed low-latency order routing systems in Java and Kafka.

EDUCATION
B.Tech, IIT Delhi (2014)

COMPENSATION & NOTICE
Notice: 30 days.
Current CTC: ₹32.0 LPA | Expected CTC: ₹38.0 LPA`
      },
      {
        id: 'CND-91120',
        name: 'Neha Saxena',
        email: 'neha.saxena.tech@gmail.com',
        phone: '+91 98105 99432',
        role: 'Senior Java Backend Engineer',
        exp: 5.5,
        skills: ['Java', 'Spring Boot', 'Microservices', 'REST APIs', 'Kafka', 'Docker', 'AWS'],
        currentCtc: 19.5,
        expectedCtc: 23,
        notice: 15,
        location: 'Noida',
        filename: 'Neha_Saxena_Java_Spring_2026.pdf',
        text: `NEHA SAXENA
Noida Sector 62 | neha.saxena.tech@gmail.com | +91 98105 99432

EXECUTIVE SUMMARY
Senior Java Backend Engineer with 5.5 years of deep expertise in Spring Boot, Kafka and cloud microservices. Proven record architecting low-latency payment APIs.

EXPERIENCE
Senior Software Engineer | Paytm Payments Bank, Noida (2022 — Present, 3.5 yrs)
- Led development of Spring Boot microservices handling 15,000 requests per minute at 99.98% uptime.
- Implemented Apache Kafka pipelines for distributed transaction events and settlement reconciliation.
- Engineered secure REST APIs with rate limiting, circuit breakers and Docker deployments.

Software Developer | Tata Consultancy Services (2019 — 2022, 2 yrs)
- Developed Java microservices and REST backends for an international retail bank.

EDUCATION
B.E. Computer Science, Delhi Technological University (2019)

DETAILS
Notice Period: 15 days (serving notice, immediate joiner).
Current CTC: ₹19.5 LPA | Expected CTC: ₹23.0 LPA`
      },
      {
        id: 'CND-91135',
        name: 'Vikas Gupta',
        email: 'vikas.gupta.junior@gmail.com',
        phone: '+91 97180 22345',
        role: 'Junior Java Programmer',
        exp: 2,
        skills: ['Java', 'Spring Boot', 'MySQL', 'Git'],
        currentCtc: 5.5,
        expectedCtc: 8,
        notice: 60,
        location: 'Noida',
        filename: 'Vikas_Gupta_CV.pdf',
        text: `VIKAS GUPTA
Noida | vikas.gupta.junior@gmail.com | +91 97180 22345

SUMMARY
Junior Java Programmer with 2.0 years of experience building simple REST endpoints and maintaining MySQL databases.

EXPERIENCE
Junior Programmer | AppSquadz Technologies, Noida (2024 — Present, 2 yrs)
- Assisted senior developers with Java and basic Spring Boot controllers.
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
        role: 'Java Backend Developer',
        exp: 6,
        skills: ['Java', 'Spring Boot', 'Microservices', 'REST APIs', 'PostgreSQL'],
        currentCtc: 16,
        expectedCtc: 20,
        notice: null,
        location: 'Noida',
        filename: 'Amitav_Sen_Resume.pdf',
        text: `AMITAV SEN
Noida Sector 50 | amitav.sen.dev@gmail.com | +91 99110 55432

SUMMARY
Java Backend Developer with 6.0 years of experience in enterprise banking and microservices.

PROFESSIONAL EXPERIENCE
Software Engineer | Nagarro, Noida (2020 — Present)
- Developed Java and Spring Boot microservices for tier-1 European banks.
- Designed secure REST APIs with token validation and PostgreSQL schemas.

EDUCATION
B.E. Computer Science, AKTU (2020)

COMPENSATION
Current CTC: ₹16.0 LPA | Expected CTC: ₹20.0 LPA
Availability: to be discussed on the screening call.`
      },
      {
        id: 'CND-91162',
        name: 'Sana Qureshi',
        email: 'sana.qureshi.dev@gmail.com',
        phone: '+91 98390 66721',
        role: 'Java Developer',
        exp: 5,
        skills: ['Java', 'Spring Boot', 'Microservices', 'REST APIs', 'Kafka', 'MySQL'],
        currentCtc: 14,
        expectedCtc: 21,
        notice: 90,
        location: 'Noida',
        filename: 'Sana_Qureshi_Java_Developer.docx',
        text: `SANA QURESHI
Noida | sana.qureshi.dev@gmail.com | +91 98390 66721

SUMMARY
Java Developer with 5.0 years of experience in Spring Boot services for retail and payments platforms.

EXPERIENCE
Software Engineer | Nucleus Software, Noida (2021 — Present, 4 yrs)
- Built Spring Boot microservices and REST APIs for a lending platform.
- Integrated Kafka topics for async loan disbursement events.
- Worked with MySQL schemas and query optimisation.

EDUCATION
B.Tech Computer Science, Amity University (2021)

AVAILABILITY
Notice Period: 90 days.
Current CTC: ₹14.0 LPA | Expected CTC: ₹21.0 LPA`
      },
      {
        id: 'CND-91178',
        name: 'Meera Iyer',
        email: 'meera.iyer.kyc@gmail.com',
        phone: '+91 98940 77218',
        role: 'Senior KYC Analyst',
        exp: 4.5,
        skills: ['KYC', 'AML checks', 'Customer Due Diligence', 'Excel', 'Sanctions', 'Transaction Monitoring'],
        currentCtc: 8.5,
        expectedCtc: 10.5,
        notice: 30,
        location: 'Pune',
        filename: 'Meera_Iyer_KYC.docx',
        text: `MEERA IYER
Pune | meera.iyer.kyc@gmail.com | +91 98940 77218

PROFILE
Senior KYC Analyst with 4.5 years in corporate banking onboarding, AML controls and periodic reviews.

EXPERIENCE
Senior KYC Analyst | Barclays Global Service Centre, Pune (2022 — Present)
- Completed KYC and AML checks for corporate clients across EMEA.
- Ran sanctions and PEP screening, escalating true matches to compliance.
- Built Excel reporting packs and managed remediation queues.

KYC Analyst | Infosys BPM, Pune (2020 — 2022)
- Reviewed customer due diligence documents and maintained audit-ready records.

EDUCATION
B.Com, Symbiosis College of Arts and Commerce (2020)

AVAILABILITY
Notice Period: 30 days.
Current CTC: ₹8.5 LPA | Expected CTC: ₹10.5 LPA`
      },
      {
        id: 'CND-91190',
        name: 'Farhan Ali',
        email: 'farhan.ali.retail@gmail.com',
        phone: '+91 98180 55390',
        role: 'Retail Store Operations Lead',
        exp: 4,
        skills: ['Retail Store Operations', 'Inventory Management', 'POS Systems', 'Vendor Management', 'Team Leadership'],
        currentCtc: 9,
        expectedCtc: 12,
        notice: 45,
        location: 'Noida',
        filename: 'Farhan_Ali_Retail_Ops.pdf',
        text: `FARHAN ALI
Noida | farhan.ali.retail@gmail.com | +91 98180 55390

SUMMARY
Retail Store Operations Lead with 4.0 years managing store operations, inventory and frontline teams.

EXPERIENCE
Store Operations Lead | Reliance Trends, Noida (2022 — Present)
- Managed daily store operations, inventory replenishment and stock audits.
- Owned POS systems, cash reconciliation and billing compliance.
- Coordinated vendor deliveries and led a team of 15 associates.
- Reduced shrinkage by 18% through weekly loss-prevention checks.

EDUCATION
BBA, Chaudhary Charan Singh University (2021)

AVAILABILITY
Notice Period: 45 days.
Current CTC: ₹9.0 LPA | Expected CTC: ₹12.0 LPA`
      }
    ];

    for (const candidate of candidates) {
      insertCandidate.run(
        candidate.id,
        candidate.name,
        candidate.email,
        candidate.phone,
        candidate.role,
        candidate.exp,
        JSON.stringify(candidate.skills),
        candidate.currentCtc,
        candidate.expectedCtc,
        candidate.notice,
        candidate.location,
        candidate.text,
        candidate.filename,
        calculateFileHash(candidate.text),
        '2026-09-15 10:30:00',
        'Hiring evaluation for Company A client requisitions under the DPDP Act, 2023'
      );
    }

    const insertEvaluation = db.prepare(`
      INSERT INTO cv_evaluations (
        id, requisition_id, candidate_id, overall_score, skills_score, exp_score,
        notice_score, ctc_score, breakdown_json, ai_confidence, uncertainty_notes,
        scoring_engine, recruiter_verified, recruiter_verified_at, recruiter_verified_by,
        recruiter_notes, pipeline_stage, rejection_reason, rejection_notes,
        client_feedback_notes, client_action_at, interview_slots_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    function addEvaluation(
      requisitionId: string,
      candidate: any,
      scorecard: any,
      state: SeedEvaluationState = {}
    ) {
      const scoringInput = {
        id: candidate.id,
        name: candidate.name,
        email: candidate.email,
        phone: candidate.phone,
        current_role: candidate.role,
        total_exp_years: candidate.exp,
        key_skills: candidate.skills,
        current_ctc: candidate.currentCtc,
        expected_ctc: candidate.expectedCtc,
        notice_period_days: candidate.notice,
        location: candidate.location,
        raw_cv_text: candidate.text
      };
      const result = scoreCandidate(scoringInput, scorecard, { blindScreening: true });
      insertEvaluation.run(
        `eval_${requisitionId.slice(-3)}_${candidate.id}`,
        requisitionId,
        candidate.id,
        result.overall_score,
        result.skills_score,
        result.exp_score,
        result.notice_score,
        result.ctc_score,
        JSON.stringify(result.breakdown),
        result.ai_confidence,
        result.uncertainty_notes,
        result.scoring_engine,
        state.verified ? 1 : 0,
        state.verifiedAt || null,
        state.verifiedBy || null,
        state.recruiterNotes || null,
        state.stage || 'ai_screened',
        state.rejectionReason || null,
        state.rejectionNotes || null,
        state.clientFeedback || null,
        state.clientActionAt || null,
        state.interviewSlots ? JSON.stringify(state.interviewSlots) : null
      );
    }

    const byId = Object.fromEntries(candidates.map((candidate) => [candidate.id, candidate]));

    addEvaluation('REQ-2026-081', byId['CND-91120'], javaScorecard, {
      stage: 'interview_scheduled',
      verified: true,
      verifiedAt: '2026-10-27 11:15:00',
      verifiedBy: 'Priya Sharma',
      recruiterNotes: 'Immediate 15-day joiner. Strong Kafka and payments depth; availability confirmed on call.',
      clientFeedback: 'Strong profile. Please hold the technical round.',
      clientActionAt: '2026-10-29 16:30:00',
      interviewSlots: [
        { date: '2026-11-05', time: '14:00 IST', round: 'Technical Round 1', interviewer: 'Vikram Malhotra' },
        { date: '2026-11-06', time: '16:30 IST', round: 'Technical Round 1 (alternative)', interviewer: 'Vikram Malhotra' }
      ]
    });

    addEvaluation('REQ-2026-081', byId['CND-91022'], javaScorecard, {
      stage: 'submitted_to_client',
      verified: true,
      verifiedAt: '2026-10-28 14:20:00',
      verifiedBy: 'Priya Sharma',
      recruiterNotes: 'Verified 6.5 years of Java and Spring experience on the phone. Candidate confirmed a buyout is possible.'
    });

    addEvaluation('REQ-2026-081', byId['CND-91162'], javaScorecard, {
      stage: 'rejected',
      verified: true,
      verifiedAt: '2026-10-24 09:40:00',
      verifiedBy: 'Priya Sharma',
      recruiterNotes: 'Strong skills, but the 90-day notice was not negotiable.',
      rejectionReason: 'Notice period too long',
      rejectionNotes: 'Client needs someone within 60 days; candidate cannot buy out the notice.',
      clientFeedback: 'Good Java depth, but the notice period does not work for this opening.',
      clientActionAt: '2026-10-25 10:05:00'
    });

    addEvaluation('REQ-2026-081', byId['CND-91150'], javaScorecard, {
      stage: 'ai_screened',
      recruiterNotes: 'Notice period is missing from the CV. Confirm availability before submitting.'
    });
    addEvaluation('REQ-2026-081', byId['CND-91088'], javaScorecard, {
      stage: 'ai_screened',
      recruiterNotes: '90-day notice is a risk. Keep warm for a role with a longer window.'
    });
    addEvaluation('REQ-2026-081', byId['CND-91105'], javaScorecard, {
      stage: 'ai_screened',
      recruiterNotes: 'Senior profile above the band; check budget and retention risk.'
    });
    addEvaluation('REQ-2026-081', byId['CND-91135'], javaScorecard, { stage: 'ai_screened' });
    addEvaluation('REQ-2026-081', byId['CND-91047'], javaScorecard, {
      stage: 'ai_screened',
      recruiterNotes: 'KYC profile added to the Java pool for comparison; not a close fit.'
    });

    addEvaluation('REQ-2026-082', byId['CND-91047'], kycScorecard, {
      stage: 'interview_scheduled',
      verified: true,
      verifiedAt: '2026-10-26 10:00:00',
      verifiedBy: 'Priya Sharma',
      recruiterNotes: 'Excellent KYC and Excel depth; 30-day notice confirmed.',
      clientFeedback: 'Shortlisted for the compliance panel.',
      clientActionAt: '2026-10-27 15:00:00',
      interviewSlots: [
        { date: '2026-11-04', time: '11:00 IST', round: 'Managerial & Compliance Round', interviewer: 'Ananya Sen' }
      ]
    });
    addEvaluation('REQ-2026-082', byId['CND-91178'], kycScorecard, {
      stage: 'submitted_to_client',
      verified: true,
      verifiedAt: '2026-10-30 12:10:00',
      verifiedBy: 'Priya Sharma',
      recruiterNotes: 'Corporate KYC and sanctions screening experience verified. Candidate is in Pune and open to relocation.'
    });

    addEvaluation('REQ-2026-083', byId['CND-91190'], retailScorecard, { stage: 'ai_screened' });

    const insertAudit = db.prepare(`
      INSERT INTO calibration_audits (
        id, week_label, requisition_id, candidate_id, ai_rank, recruiter_rank,
        discrepancy_score, agreement_status, recruiter_override_reason, audited_by, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const calibrationSamples: Array<
      [string, string, string, string, number, number, string, string, string]
    > = [
      ['cal_w42_01', 'Week 42 (12–18 Oct)', 'REQ-2026-081', 'CND-91120', 1, 1, 'aligned', 'Full agreement. Strong Kafka and payments depth, with 15-day availability.', '2026-10-19 11:00:00'],
      ['cal_w42_02', 'Week 42 (12–18 Oct)', 'REQ-2026-081', 'CND-91022', 2, 2, 'aligned', 'Full agreement. Verified for the HDFC Tech platform.', '2026-10-19 11:15:00'],
      ['cal_w43_01', 'Week 43 (19–25 Oct)', 'REQ-2026-081', 'CND-91105', 4, 6, 'major_override', 'Recruiter downranked the candidate: ₹38 LPA expectation is well above the budget.', '2026-10-26 14:00:00'],
      ['cal_w43_02', 'Week 43 (19–25 Oct)', 'REQ-2026-081', 'CND-91088', 3, 5, 'minor_discrepancy', 'Recruiter paused the candidate pending a notice-period discussion.', '2026-10-26 14:30:00'],
      ['cal_w44_01', 'Week 44 (26 Oct–1 Nov)', 'REQ-2026-082', 'CND-91047', 1, 1, 'aligned', 'Full agreement. KYC and AML evidence matched the scorecard.', '2026-11-01 10:00:00']
    ];

    calibrationSamples.forEach(([id, week, reqId, candidateId, aiRank, recruiterRank, status, reason, createdAt]) => {
      insertAudit.run(id, week, reqId, candidateId, aiRank, recruiterRank, Math.abs(aiRank - recruiterRank), status, reason, 'Rajesh Verma', createdAt);
    });

    logAccess({
      userId: 'usr_recruiter_priya',
      userName: 'Priya Sharma',
      userRole: 'recruiter',
      candidateId: 'CND-91022',
      requisitionId: 'REQ-2026-081',
      action: 'view_unmasked_cv',
      details: { reason: 'Pre-submission qualification call' }
    });
    logAccess({
      userId: 'usr_recruiter_priya',
      userName: 'Priya Sharma',
      userRole: 'recruiter',
      candidateId: 'CND-91022',
      requisitionId: 'REQ-2026-081',
      action: 'stage_change',
      details: { from: 'recruiter_verified', to: 'submitted_to_client' }
    });
    logAccess({
      userId: 'usr_client_vikram',
      userName: 'Vikram Malhotra',
      userRole: 'client_hiring_manager',
      candidateId: 'CND-91022',
      requisitionId: 'REQ-2026-081',
      action: 'view_client_shortlist',
      details: { client_company: 'HDFC Tech Platform', masked: true }
    });
  });

  runSeed();
  console.log('Seeded demo data.');
}

function ensureSeeded() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;

  if (userCount === 0) {
    seedDatabase();
    return;
  }

  // Existing databases from the first build have users but no password hashes.
  const usersWithoutPasswords = db.prepare('SELECT id FROM users WHERE password_hash IS NULL').all();
  if (usersWithoutPasswords.length > 0) {
    const passwordHash = hashPassword(DEMO_PASSWORD);
    const update = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    for (const user of usersWithoutPasswords) update.run(passwordHash, user.id);
  }
}

if (require.main === module) {
  seedDatabase();
}

export { seedDatabase, ensureSeeded };
