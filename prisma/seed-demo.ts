// Demo seed — builds a believable fixed-bid delivery project for walkthroughs.
//
//   npm run db:seed:demo
//
// Idempotent: re-running updates the same rows rather than duplicating them.
// Everything is dated relative to "today" so the board always looks current:
// one completed sprint (for velocity history), one mid-flight, one planned.
//
// This is additive — it never touches the `ORB` project created by seed.ts.
import { PrismaClient, StatusCategory, Discipline, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const PROJECT_KEY = "ACP";
const DAY = 86_400_000;

// UTC midnight of the server's current local calendar date — the same
// convention pulseService.dateOnly() uses for the @db.Date pulse column, so
// seeded pulses land on the day the digest actually asks for.
const now = new Date();
const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
const day = (offset: number) => new Date(today.getTime() + offset * DAY);

const WORKFLOW: { name: string; category: StatusCategory; color: string }[] = [
  { name: "Backlog", category: "NOT_STARTED", color: "#6B778C" },
  { name: "To Do", category: "NOT_STARTED", color: "#6B778C" },
  { name: "In Progress", category: "IN_PROGRESS", color: "#0052CC" },
  { name: "In Review", category: "IN_PROGRESS", color: "#FF8B00" },
  { name: "Done", category: "COMPLETED", color: "#0F6E56" },
];

const TEAM = [
  { email: "raghuram@innominds.com", name: "Raghuram", role: "PM", discipline: "DELIVERY" },
  { email: "priya.reddy@innominds.com", name: "Priya Reddy", role: "LEAD", discipline: "DEVELOPMENT" },
  { email: "arjun.kumar@innominds.com", name: "Arjun Kumar", role: "CONTRIBUTOR", discipline: "DEVELOPMENT" },
  { email: "sneha.menon@innominds.com", name: "Sneha Menon", role: "CONTRIBUTOR", discipline: "QE" },
  { email: "vikram.rao@innominds.com", name: "Vikram Rao", role: "CONTRIBUTOR", discipline: "UX" },
  { email: "meera.nair@innominds.com", name: "Meera Nair", role: "VIEWER", discipline: "DELIVERY" },
] as const;

type ItemSpec = {
  key: number;
  type: "STORY" | "BUG" | "TASK" | "SPIKE";
  title: string;
  status: string;
  epic?: string;
  feature?: string;
  sprint?: string;
  assignee?: string;
  discipline?: Discipline;
  priority?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  points?: number;
  hours?: number;
  description?: string;
  ac?: string;
  // bug-only
  severity?: "BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR" | "TRIVIAL";
  repro?: string;
  expected?: string;
  actual?: string;
  environment?: string;
  verification?: "NOT_VERIFIED" | "VERIFIED" | "REOPENED";
  // spike-only
  research?: string;
  timeBox?: string;
  outcome?: string;
  blocked?: string;
};

const ITEMS: ItemSpec[] = [
  // ---- Epic: Customer Authentication (Sprint 1, completed) ----
  { key: 1, type: "SPIKE", title: "Evaluate SSO providers for the portal", status: "Done", epic: "auth", sprint: "s1",
    assignee: "priya.reddy@innominds.com", discipline: "ARCHITECTURE", priority: "HIGH", points: 3,
    research: "Which identity provider best fits Acme's existing Azure AD tenant?",
    timeBox: "2 days",
    outcome: "Entra ID via OIDC. Auth0 ruled out on cost; self-hosted Keycloak ruled out on ops burden." },
  { key: 2, type: "STORY", title: "As a customer, I can sign in with email and password", status: "Done", epic: "auth", feature: "signin", sprint: "s1",
    assignee: "arjun.kumar@innominds.com", discipline: "DEVELOPMENT", priority: "CRITICAL", points: 5, hours: 14,
    description: "Email + password sign-in against the Acme identity store, with rate limiting.",
    ac: "Given a registered customer\nWhen they submit valid credentials\nThen they land on the portal dashboard\n\nGiven five consecutive failed attempts\nWhen a sixth is made\nThen the account is locked for 15 minutes" },
  { key: 3, type: "STORY", title: "As a customer, I can reset my password by email", status: "Done", epic: "auth", feature: "signin", sprint: "s1",
    assignee: "arjun.kumar@innominds.com", discipline: "DEVELOPMENT", priority: "HIGH", points: 3, hours: 9,
    ac: "Given a customer requests a reset\nWhen they open the emailed link within 30 minutes\nThen they can set a new password" },
  { key: 4, type: "TASK", title: "Provision staging environment and CI pipeline", status: "Done", sprint: "s1",
    assignee: "priya.reddy@innominds.com", discipline: "DEVOPS", priority: "HIGH", hours: 8 },

  // ---- Epic: Customer Authentication (Sprint 2, active) ----
  { key: 5, type: "STORY", title: "As a customer, I can sign in with Acme SSO", status: "In Progress", epic: "auth", feature: "sso", sprint: "s2",
    assignee: "arjun.kumar@innominds.com", discipline: "DEVELOPMENT", priority: "CRITICAL", points: 8, hours: 20,
    description: "OIDC against Acme's Entra ID tenant, per the ACP-1 spike outcome.",
    ac: "Given a customer on the Acme tenant\nWhen they choose Sign in with Acme SSO\nThen they authenticate via Entra ID and land on the dashboard\n\nGiven a user outside the tenant\nWhen they attempt SSO\nThen they see a clear not-authorised message" },
  { key: 6, type: "STORY", title: "As a customer, my session stays alive across tabs", status: "In Review", epic: "auth", feature: "sso", sprint: "s2",
    assignee: "arjun.kumar@innominds.com", discipline: "DEVELOPMENT", priority: "MEDIUM", points: 3, hours: 7,
    ac: "Given an authenticated customer with two tabs open\nWhen the token refreshes in one\nThen the other remains signed in" },
  { key: 7, type: "BUG", title: "Session drops during silent token refresh", status: "In Progress", epic: "auth", sprint: "s2",
    assignee: "priya.reddy@innominds.com", discipline: "DEVELOPMENT", priority: "CRITICAL", severity: "MAJOR",
    repro: "1. Sign in to the portal\n2. Leave the tab idle for 30 minutes\n3. Click any navigation item",
    expected: "The session refreshes silently and navigation succeeds.",
    actual: "User is returned to the sign-in screen and loses unsaved form state.",
    environment: "Chrome 131 · staging", verification: "NOT_VERIFIED",
    blocked: "Needs a staging load-test slot to reproduce the race reliably — waiting on infra." },
  { key: 8, type: "STORY", title: "As a customer, I see a branded sign-in screen", status: "Done", epic: "auth", feature: "signin", sprint: "s2",
    assignee: "vikram.rao@innominds.com", discipline: "UX", priority: "MEDIUM", points: 2, hours: 5 },

  // ---- Epic: Billing & Invoices (Sprint 2 + backlog) ----
  { key: 9, type: "STORY", title: "As a customer, I can view my billing history", status: "In Progress", epic: "billing", feature: "history", sprint: "s2",
    assignee: "priya.reddy@innominds.com", discipline: "DEVELOPMENT", priority: "HIGH", points: 5, hours: 12,
    ac: "Given a customer with past invoices\nWhen they open Billing\nThen they see invoices newest-first with status and amount" },
  { key: 10, type: "STORY", title: "As a customer, I can download an invoice as PDF", status: "To Do", epic: "billing", feature: "history", sprint: "s2",
    assignee: "arjun.kumar@innominds.com", discipline: "DEVELOPMENT", priority: "MEDIUM", points: 3 },
  { key: 11, type: "TASK", title: "Integrate Acme billing API (sandbox credentials)", status: "In Review", epic: "billing", sprint: "s2",
    assignee: "priya.reddy@innominds.com", discipline: "DEVELOPMENT", priority: "HIGH", hours: 10 },
  { key: 12, type: "BUG", title: "Invoice totals round inconsistently in the summary row", status: "To Do", epic: "billing", sprint: "s2",
    assignee: "sneha.menon@innominds.com", discipline: "QE", priority: "MEDIUM", severity: "MINOR",
    repro: "1. Open Billing\n2. Compare the summary total with the sum of line items",
    expected: "Summary equals the sum of line items.",
    actual: "Summary is off by up to 0.02 on multi-currency invoices.",
    environment: "staging", verification: "NOT_VERIFIED" },
  { key: 13, type: "STORY", title: "As a customer, I can update my billing contact", status: "Backlog", epic: "billing",
    discipline: "DEVELOPMENT", priority: "LOW", points: 3 },
  { key: 14, type: "STORY", title: "As a customer, I receive an email when an invoice is issued", status: "Backlog", epic: "billing",
    discipline: "DEVELOPMENT", priority: "MEDIUM", points: 5 },

  // ---- Epic: Admin Console (backlog / planning) ----
  { key: 15, type: "STORY", title: "As an Acme admin, I can search customers", status: "Backlog", epic: "admin", sprint: "s3",
    discipline: "DEVELOPMENT", priority: "HIGH", points: 5 },
  { key: 16, type: "STORY", title: "As an Acme admin, I can suspend a customer account", status: "Backlog", epic: "admin", sprint: "s3",
    discipline: "DEVELOPMENT", priority: "MEDIUM", points: 3 },
  { key: 17, type: "STORY", title: "As an Acme admin, I can export a customer activity report", status: "Backlog", epic: "admin",
    discipline: "DEVELOPMENT", priority: "LOW", points: 8 },
  { key: 18, type: "SPIKE", title: "Assess data residency requirements for EU customers", status: "Backlog", epic: "admin",
    discipline: "ARCHITECTURE", priority: "HIGH", points: 2,
    research: "Do EU customer records need to stay in an EU region under the Acme contract?",
    timeBox: "1 day" },

  // ---- Cross-cutting ----
  { key: 19, type: "TASK", title: "Accessibility pass on the customer portal (WCAG 2.1 AA)", status: "To Do", sprint: "s2",
    assignee: "vikram.rao@innominds.com", discipline: "UX", priority: "MEDIUM", hours: 12 },
  { key: 20, type: "TASK", title: "Write regression suite for the authentication epic", status: "In Progress", epic: "auth", sprint: "s2",
    assignee: "sneha.menon@innominds.com", discipline: "QE", priority: "HIGH", hours: 10 },
];

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: "innominds" },
    update: {},
    create: { name: "Innominds", slug: "innominds", plan: "pilot" },
  });

  // --- team ---------------------------------------------------------------
  const users: Record<string, string> = {};
  for (const m of TEAM) {
    const u = await prisma.user.upsert({
      where: { email: m.email },
      update: { name: m.name },
      create: { email: m.email, name: m.name, provider: "magic_link" },
    });
    users[m.email] = u.id;
    await prisma.orgMember.upsert({
      where: { orgId_userId: { orgId: org.id, userId: u.id } },
      update: {},
      create: { orgId: org.id, userId: u.id, role: m.role === "PM" ? "OWNER" : "MEMBER" },
    });
  }
  const pmId = users["raghuram@innominds.com"];

  // --- project ------------------------------------------------------------
  const project = await prisma.project.upsert({
    where: { orgId_key: { orgId: org.id, key: PROJECT_KEY } },
    update: {},
    create: {
      orgId: org.id,
      name: "Acme Customer Portal",
      key: PROJECT_KEY,
      description:
        "Fixed-bid delivery of Acme's self-service customer portal: authentication, billing and an internal admin console.",
      type: "FIXED_BID",
      status: "ACTIVE",
      estimationMode: "BOTH",
      accentColor: "#0F6E56",
      startDate: day(-30),
      targetDate: day(45),
    },
  });

  for (const m of TEAM) {
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId: users[m.email] } },
      update: { role: m.role, discipline: m.discipline },
      create: {
        projectId: project.id,
        userId: users[m.email],
        role: m.role,
        discipline: m.discipline,
      },
    });
  }

  await prisma.projectAiConfig.upsert({
    where: { projectId: project.id },
    update: {},
    create: {
      projectId: project.id,
      aiMode: "DISABLED", // flip to CLOUD_API once a key is configured
      enabledFeatures: ["backlog_gen", "test_case_gen", "report_draft"],
      approvalRule: "PM_OR_LEAD_APPROVAL",
    },
  });

  // --- workflow -----------------------------------------------------------
  const statusIds: Record<string, string> = {};
  for (const [i, s] of WORKFLOW.entries()) {
    const row = await prisma.workflowStatus.upsert({
      where: { projectId_name: { projectId: project.id, name: s.name } },
      update: { displayOrder: i, color: s.color, category: s.category },
      create: { projectId: project.id, name: s.name, category: s.category, color: s.color, displayOrder: i },
    });
    statusIds[s.name] = row.id;
  }

  // --- sprints ------------------------------------------------------------
  const sprintSpecs = [
    { slug: "s1", name: "Sprint 1", status: "COMPLETED" as const, start: day(-24), end: day(-10),
      goal: "Stand up password authentication and the delivery pipeline." },
    { slug: "s2", name: "Sprint 2", status: "ACTIVE" as const, start: day(-4), end: day(10),
      goal: "Ship Acme SSO and the first billing screens." },
    { slug: "s3", name: "Sprint 3", status: "PLANNING" as const, start: day(11), end: day(25),
      goal: "Open the admin console." },
  ];
  const sprintIds: Record<string, string> = {};
  for (const s of sprintSpecs) {
    const existing = await prisma.sprint.findFirst({ where: { projectId: project.id, name: s.name } });
    const row = existing
      ? await prisma.sprint.update({
          where: { id: existing.id },
          data: { status: s.status, startDate: s.start, endDate: s.end, goal: s.goal },
        })
      : await prisma.sprint.create({
          data: { projectId: project.id, name: s.name, status: s.status, startDate: s.start, endDate: s.end, goal: s.goal },
        });
    sprintIds[s.slug] = row.id;
  }

  // --- epics & features ---------------------------------------------------
  const epicSpecs = [
    { slug: "auth", title: "Customer Authentication", status: "IN_PROGRESS" as const,
      description: "Password and SSO sign-in, session handling and account recovery.", order: 0 },
    { slug: "billing", title: "Billing & Invoices", status: "IN_PROGRESS" as const,
      description: "Billing history, invoice download and billing contact management.", order: 1 },
    { slug: "admin", title: "Admin Console", status: "NOT_STARTED" as const,
      description: "Internal tooling for Acme staff to support portal customers.", order: 2 },
  ];
  const epicIds: Record<string, string> = {};
  for (const e of epicSpecs) {
    const existing = await prisma.epic.findFirst({ where: { projectId: project.id, title: e.title } });
    const row = existing
      ? await prisma.epic.update({ where: { id: existing.id }, data: { status: e.status, description: e.description } })
      : await prisma.epic.create({
          data: { projectId: project.id, title: e.title, description: e.description, status: e.status,
            sortOrder: e.order, startDate: day(-30), targetDate: day(40) },
        });
    epicIds[e.slug] = row.id;
  }

  const featureSpecs = [
    { slug: "signin", epic: "auth", title: "Password sign-in", status: "COMPLETED" as const },
    { slug: "sso", epic: "auth", title: "Acme SSO", status: "IN_PROGRESS" as const },
    { slug: "history", epic: "billing", title: "Billing history", status: "IN_PROGRESS" as const },
  ];
  const featureIds: Record<string, string> = {};
  for (const [i, f] of featureSpecs.entries()) {
    const existing = await prisma.feature.findFirst({ where: { projectId: project.id, title: f.title } });
    const row = existing
      ? await prisma.feature.update({ where: { id: existing.id }, data: { status: f.status } })
      : await prisma.feature.create({
          data: { projectId: project.id, epicId: epicIds[f.epic], title: f.title, status: f.status, sortOrder: i },
        });
    featureIds[f.slug] = row.id;
  }

  // --- work items ---------------------------------------------------------
  const itemIds: Record<number, string> = {};
  for (const [i, it] of ITEMS.entries()) {
    const itemKey = `${PROJECT_KEY}-${it.key}`;
    const data = {
      projectId: project.id,
      epicId: it.epic ? epicIds[it.epic] : null,
      featureId: it.feature ? featureIds[it.feature] : null,
      sprintId: it.sprint ? sprintIds[it.sprint] : null,
      statusId: statusIds[it.status],
      assigneeId: it.assignee ? users[it.assignee] : null,
      reporterId: pmId,
      type: it.type,
      title: it.title,
      description: it.description ?? null,
      acceptanceCriteria: it.ac ?? null,
      priority: it.priority ?? "MEDIUM",
      severity: it.severity ?? null,
      discipline: it.discipline ?? null,
      storyPoints: it.points ?? null,
      estimatedHours: it.hours ?? null,
      stepsToReproduce: it.repro ?? null,
      expectedResult: it.expected ?? null,
      actualResult: it.actual ?? null,
      environment: it.environment ?? null,
      verificationStatus: it.verification ?? null,
      researchQuestion: it.research ?? null,
      timeBox: it.timeBox ?? null,
      outcomeSummary: it.outcome ?? null,
      isBlocked: !!it.blocked,
      blockerReason: it.blocked ?? null,
      sortOrder: i,
    };
    const row = await prisma.workItem.upsert({
      where: { projectId_itemKey: { projectId: project.id, itemKey } },
      update: data,
      create: { ...data, itemKey },
    });
    itemIds[it.key] = row.id;
  }

  // Keep generated keys from colliding with the seeded ones.
  await prisma.project.update({
    where: { id: project.id },
    data: { nextItemNumber: ITEMS.length + 1 },
  });

  // --- links --------------------------------------------------------------
  const links = [
    { from: 7, to: 5, type: "FOUND_IN" as const },   // session bug found testing SSO
    { from: 7, to: 6, type: "BLOCKS" as const },      // ...and blocks the cross-tab story
    { from: 10, to: 9, type: "DEPENDS_ON" as const }, // PDF download needs history
    { from: 12, to: 11, type: "FOUND_IN" as const },  // rounding bug from the API task
  ];
  for (const l of links) {
    await prisma.workItemLink.upsert({
      where: {
        sourceItemId_targetItemId_linkType: {
          sourceItemId: itemIds[l.from], targetItemId: itemIds[l.to], linkType: l.type,
        },
      },
      update: {},
      create: {
        sourceItemId: itemIds[l.from], targetItemId: itemIds[l.to], linkType: l.type, createdById: pmId,
      },
    });
  }

  // --- test cases ---------------------------------------------------------
  const testCases = [
    { item: 5, title: "SSO happy path for a tenant user", status: "ACTIVE" as const, priority: "CRITICAL" as const,
      pre: "Customer account exists on the Acme Entra ID tenant.",
      steps: [
        { stepNumber: 1, action: "Open the portal sign-in screen", expectedResult: "Sign in with Acme SSO is visible" },
        { stepNumber: 2, action: "Click Sign in with Acme SSO", expectedResult: "Redirected to the Entra ID consent screen" },
        { stepNumber: 3, action: "Authenticate with valid tenant credentials", expectedResult: "Returned to the portal dashboard, signed in" },
      ],
      expected: "The customer reaches the dashboard with an active session." },
    { item: 5, title: "SSO rejects a non-tenant user", status: "ACTIVE" as const, priority: "HIGH" as const,
      pre: "A Google account that is not on the Acme tenant.",
      steps: [
        { stepNumber: 1, action: "Click Sign in with Acme SSO", expectedResult: "Entra ID screen opens" },
        { stepNumber: 2, action: "Authenticate with a non-tenant account", expectedResult: "Returned to the portal with a not-authorised message" },
      ],
      expected: "Access is refused and the reason is explained." },
    { item: 6, title: "Session survives a token refresh in a second tab", status: "DRAFT" as const, priority: "MEDIUM" as const,
      pre: "Signed in with two tabs open on the portal.",
      steps: [
        { stepNumber: 1, action: "Leave both tabs idle until the token refreshes", expectedResult: "Refresh happens silently" },
        { stepNumber: 2, action: "Navigate in the second tab", expectedResult: "Still signed in, no redirect to sign-in" },
      ],
      expected: "Both tabs remain authenticated." },
    { item: 9, title: "Billing history lists invoices newest first", status: "ACTIVE" as const, priority: "HIGH" as const,
      pre: "Customer has at least three historical invoices.",
      steps: [
        { stepNumber: 1, action: "Open the Billing tab", expectedResult: "Invoice table renders" },
        { stepNumber: 2, action: "Inspect the ordering", expectedResult: "Invoices are sorted newest to oldest" },
      ],
      expected: "Ordering, status and amount are correct for every row." },
  ];
  for (const [i, tc] of testCases.entries()) {
    const existing = await prisma.testCase.findFirst({
      where: { workItemId: itemIds[tc.item], title: tc.title },
    });
    const payload = {
      title: tc.title,
      preconditions: tc.pre,
      steps: tc.steps as unknown as Prisma.InputJsonValue,
      expectedResult: tc.expected,
      testType: "MANUAL" as const,
      priority: tc.priority,
      status: tc.status,
      sortOrder: i,
      approvedAt: tc.status === "ACTIVE" ? day(-2) : null,
      approvedById: tc.status === "ACTIVE" ? users["priya.reddy@innominds.com"] : null,
    };
    if (existing) {
      await prisma.testCase.update({ where: { id: existing.id }, data: payload });
    } else {
      await prisma.testCase.create({
        data: {
          ...payload,
          workItemId: itemIds[tc.item],
          createdById: users["sneha.menon@innominds.com"],
        },
      });
    }
  }

  // --- comments -----------------------------------------------------------
  const comments = [
    { item: 5, author: "arjun.kumar@innominds.com", body: "OIDC discovery and the callback are working against the Acme sandbox tenant. Token storage and refresh are next." },
    { item: 5, author: "raghuram@innominds.com", body: "Good progress. Please make sure the not-authorised path has copy Acme support can actually act on." },
    { item: 7, author: "priya.reddy@innominds.com", body: "Reproduced once under load — looks like two refreshes racing. Need a staging slot to confirm." },
    { item: 9, author: "sneha.menon@innominds.com", body: "Multi-currency invoices are the risky case here; I've added ACP-12 for the rounding issue." },
  ];
  for (const c of comments) {
    const existing = await prisma.comment.findFirst({
      where: { workItemId: itemIds[c.item], body: c.body },
    });
    if (!existing) {
      await prisma.comment.create({
        data: { workItemId: itemIds[c.item], authorId: users[c.author], body: c.body },
      });
    }
  }

  // --- deliverables -------------------------------------------------------
  const deliverables = [
    { name: "Sprint 1 build — password authentication", owner: "Raghuram", status: "ACCEPTED" as const,
      due: day(-9), delivered: day(-10), notes: "Signed off by Acme on the sprint review call." },
    { name: "Architecture decision record — identity provider", owner: "Priya Reddy", status: "DELIVERED" as const,
      due: day(-12), delivered: day(-13), notes: "Entra ID via OIDC. Shared as PDF." },
    { name: "Sprint 2 build — SSO and billing history", owner: "Raghuram", status: "IN_PROGRESS" as const,
      due: day(11), delivered: null, notes: "Tracks the active sprint." },
    { name: "Test strategy and regression pack", owner: "Sneha Menon", status: "IN_PROGRESS" as const,
      due: day(6), delivered: null, notes: "Authentication suite first, billing to follow." },
    { name: "UAT environment handover", owner: "Priya Reddy", status: "PLANNED" as const,
      due: day(24), delivered: null },
  ];
  for (const d of deliverables) {
    const existing = await prisma.deliverable.findFirst({
      where: { projectId: project.id, name: d.name },
    });
    const payload = {
      owner: d.owner, status: d.status, dueDate: d.due, deliveredAt: d.delivered ?? null, notes: d.notes ?? null,
    };
    if (existing) {
      await prisma.deliverable.update({ where: { id: existing.id }, data: payload });
    } else {
      await prisma.deliverable.create({ data: { ...payload, projectId: project.id, name: d.name } });
    }
  }

  // --- today's daily pulses ----------------------------------------------
  const pulses = [
    { user: "priya.reddy@innominds.com",
      note: "Billing API integration is ready for review. Spending tomorrow on the session bug.",
      items: [
        { item: 9, note: "Invoice list rendering against the sandbox API; pagination still to do.", hours: 4 },
        { item: 7, note: "Reproduced the dropped session once under load — it's a refresh race.", hours: 3,
          blocker: "Need a staging load-test slot from infra to confirm the fix. Raised with IT yesterday." },
      ] },
    { user: "arjun.kumar@innominds.com",
      note: "SSO should be demo-ready by Thursday.",
      items: [
        { item: 5, note: "OIDC callback verified end to end. Token refresh is the remaining piece.", hours: 6 },
        { item: 6, note: "Cross-tab session story is in review, waiting on ACP-7.", hours: 1 },
      ] },
    { user: "sneha.menon@innominds.com",
      note: "Two SSO test cases approved and ready to execute once ACP-5 lands.",
      items: [
        { item: 20, note: "Regression suite scaffolding done; auth cases written.", hours: 5 },
        { item: 12, note: "Logged the rounding discrepancy with sample multi-currency invoices.", hours: 2 },
      ] },
  ];
  for (const p of pulses) {
    const pulse = await prisma.dailyPulse.upsert({
      where: { projectId_userId_date: { projectId: project.id, userId: users[p.user], date: today } },
      update: { generalNote: p.note },
      create: { projectId: project.id, userId: users[p.user], date: today, generalNote: p.note },
    });
    await prisma.dailyPulseItem.deleteMany({ where: { pulseId: pulse.id } });
    await prisma.dailyPulseItem.createMany({
      data: p.items.map((i) => ({
        pulseId: pulse.id,
        workItemId: itemIds[i.item],
        progressNote: i.note,
        isBlocker: !!i.blocker,
        blockerDetail: i.blocker ?? null,
        hoursLogged: i.hours ?? null,
      })),
    });
  }

  console.log(
    [
      "",
      "  Demo project seeded.",
      "",
      `    Project     ${project.name} (${PROJECT_KEY})  ·  fixed-bid`,
      `    Team        ${TEAM.length} members across 5 disciplines`,
      `    Work        ${ITEMS.length} items · 3 epics · 3 features`,
      `    Sprints     1 completed · 1 active · 1 planning`,
      `    QA          ${testCases.length} test cases · ${links.length} links`,
      `    Delivery    ${deliverables.length} deliverables · ${pulses.length} pulses today`,
      "",
      `    Open  /${PROJECT_KEY}/board`,
      "",
    ].join("\n"),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
