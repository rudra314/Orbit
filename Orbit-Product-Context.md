# Orbit — Product Context

## Product

Orbit is an AI Native Delivery Management Platform built for IT services company project teams that begin work before enterprise PM tools are available, configured, or licensed.

Orbit is not a generic project management tool. It is a delivery execution workspace designed around how services delivery teams actually work: a PM creates a project, invites a cross-functional team (product, UX, development, QE, DevOps, architecture, delivery leadership), structures a backlog, plans sprints, tracks execution on a board, links QA work, and reports status to stakeholders.

The core differentiator is that AI is the foundation, not a plugin. AI generates draft user stories and test cases from requirements. AI drafts weekly status reports from live project data. AI flags delivery risks. All AI output remains draft until a human reviews and approves it. The PM stays accountable for scope and quality — AI accelerates the work, it does not replace the judgment.

Orbit is built by Raghuram, Product Manager, Solutions Engineering at Innominds, using Claude Code. The first deployment is an internal pilot on an Innominds VM for one project team.

## Market segments

### Primary segment (now)
Internal project teams at Innominds that manage internal initiatives or fixed-bid customer deliveries. These teams need a PM workspace but lack enterprise JIRA or Azure DevOps licenses. They currently fall back to Excel, shared documents, and manual status calls.

### Secondary segment (after pilot validation)
Other teams within Innominds — across practices, delivery units, and geographies — that face the same tooling gap. The product must prove itself with one team before broader internal rollout.

### Future segment (after internal approval)
Mid-size IT services and consulting companies (50-500 employees) that run multiple client delivery projects and need a fast, AI-assisted PM tool without heavy licensing costs. These companies share the same structural problem as Innominds: project teams spin up faster than enterprise tooling can be provisioned.

### Out of segment
Large enterprises with existing JIRA or Azure DevOps deployments and established workflows. Orbit does not compete for displacement of entrenched enterprise tools. It targets the gap where those tools are absent, too expensive, or too slow to provision.

## Value proposition

### For the PM
Stop assembling status from spreadsheets. Create a project in minutes, not weeks. Paste a requirement, get a structured backlog with stories and test cases. Generate weekly reports from live data instead of manually compiling them. Know what is on track, what is blocked, and what to escalate — without chasing people.

### For the developer
See assigned work with clear acceptance criteria and linked context. Update status in under five seconds by dragging a card. Never fill out a form to move a ticket. See linked bugs and test cases without switching tools.

### For the QE engineer
Review AI-generated test cases instead of writing them from scratch. Link bugs to the stories they were found in. Track verification status. Have a test case repository that lives inside the story, not in a separate spreadsheet.

### For the delivery leader
See project health at a glance — sprint progress, open blockers, high-priority bugs, upcoming deliverables, and the PM's latest summary — without opening a spreadsheet or joining a status call.

### For the organization
Reduce per-project PM setup time from days to minutes. Build internal delivery IP. Create a reusable tool that can be offered to new project teams without procurement cycles. Maintain full control of project data on internal infrastructure.

## Primary competitors

### JIRA (Atlassian)
Industry standard for software project management. Deeply configurable but complex. Requires licensing ($7.75/user/month standard). AI features (Atlassian Intelligence) are add-on and organization-wide, not project-level. Strengths: ecosystem, marketplace, integrations, maturity. Weaknesses: setup complexity, configuration overhead, slow for small teams, no project-level AI policy.

### Azure DevOps (Microsoft)
Strong for Microsoft ecosystem teams. Free for up to 5 users. Best native work item hierarchy (Epic → Feature → User Story → Task). Strengths: 4-level hierarchy, CI/CD integration, free tier. Weaknesses: UI feels dated, AI features are limited, not designed for services delivery workflows.

### Linear
Opinionated, fast, developer-loved. Intentionally simple (2-level hierarchy, fixed workflow). AI features available but not delivery-focused. Strengths: speed, design quality, developer experience. Weaknesses: no QA workflow, no test case management, no project-level AI configuration, limited hierarchy for complex delivery projects.

### ClickUp
Maximum flexibility with deep hierarchy (6-7 levels). Free tier available but AI features are paywalled. Strengths: flexibility, free tier generosity, views. Weaknesses: overwhelming configuration, no built-in QA traceability, AI features require paid tier.

### Shortcut (formerly Clubhouse)
Clean 3-level hierarchy (Epic → Story → Task). Good balance of simplicity and structure. Strengths: developer-friendly, clean design. Weaknesses: no QA test case management, no AI generation, limited reporting.

### Plane.so
Open-source JIRA alternative. Self-hostable. Growing community. Strengths: open source, self-hosted, active development. Weaknesses: no AI features, no test case management, no delivery-specific workflows, early stage maturity.

### Where Orbit wins
None of these competitors offer the combination of: project-level AI configuration, AI-generated stories AND test cases with human approval workflow, built-in QA traceability (story → test case → bug → verification), delivery-focused reporting from live data, and zero-license self-hosted deployment. Orbit does not try to match their breadth — it targets a specific gap they all leave open.

## What we are NOT optimizing for

### Feature parity with JIRA
Orbit will never match JIRA's 20 years of features, marketplace, or plugin ecosystem. We are not building "JIRA but free." We are building a focused delivery execution tool with AI at its core. If a team needs advanced JIRA features (custom workflows with 15 states, complex permission schemes, portfolio-level planning across 50 projects), JIRA is the right tool for them — not Orbit.

### Billing, invoicing, or financial management
Orbit tracks delivery work, not money. It does not generate invoices, manage timesheets, calculate billing rates, or handle purchase orders. Financial tools like SAP, QuickBooks, or custom billing systems handle this. Orbit's deliverables tracking records what was delivered and when — but not at what cost.

### Time sheet or resource utilization tracking
Orbit tracks estimated hours and logged hours at the work item level for sprint planning and velocity. It is not a time sheet management system. It does not track billable hours, utilization rates, bench time, or resource allocation across projects. HR and resource management tools handle this.

### Customer-facing portal (Phase 1)
Client access, client visibility, and customer-facing dashboards are deferred until internal usage, permissions, audit controls, and reporting are proven. Phase 1 is internal only. Customer access is a Phase 4 feature that requires security review, data leakage testing, and stakeholder approval.

### Mobile native app
Orbit is a responsive web application. A native mobile app (iOS/Android) is not in scope. Responsive web support for basic viewing on tablets is acceptable for Phase 1. If mobile demand is validated during the pilot, a progressive web app (PWA) is the most efficient path.

### Advanced BI and analytics
Orbit provides sprint-level reporting: burndown, velocity, work by status, work by discipline, blocker trends, and QA metrics. It does not provide portfolio-level analytics, cross-project resource optimization, predictive delivery modeling, or executive BI dashboards. If those are needed, Orbit's data can be exported to dedicated analytics tools.

### Plugin or extension marketplace
Orbit's architecture supports future extensibility (event-driven design, API-first), but building a plugin marketplace, third-party developer program, or app store is not a Phase 1-4 goal. Integrations are built directly into the product (GitHub, GitLab, Teams) rather than through a plugin system.

### White-label or multi-brand deployment
Orbit supports project accent colors and light/dark themes. Full white-label branding (custom logos, custom domains, complete visual rebrand for external clients) is a Phase 5+ consideration, not a current priority.

### Replacing existing tools where they work
If a client provides JIRA for a T&M project and the team is productive with it, Orbit does not need to replace it. Orbit targets the gap — projects where no tool exists, where Excel is the fallback, or where enterprise licensing is not available. It is a complement to the enterprise ecosystem, not a replacement for it.
