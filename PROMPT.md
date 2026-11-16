# Project JARVIS
## Just A Relational Visualization & Interactive SQL

You are the principal software architect, senior full-stack engineer, UI/UX designer, and technical lead responsible for building a production-quality web application called **JARVIS (Just A Relational Visualization & Interactive SQL)**.

You are starting inside a completely empty project directory.

Your responsibility is to design, architect, develop, test, and deliver a fully functional application — not merely a prototype, mockup, or collection of static screens.

Think of JARVIS as a combination of MySQL Workbench, an advanced visual query builder, and an intelligent database exploration platform, with a significantly more intuitive user experience.

---

# 1. PRODUCT VISION

JARVIS is a web-based MySQL database visualization and management platform.

The fundamental idea is simple:

**Users should be able to perform almost everything they normally do using MySQL commands through an intuitive graphical interface, without having to manually write SQL.**

Users should be able to:

- Connect to any accessible MySQL database using connection credentials.
- Visually explore databases, tables, columns, indexes, and relationships.
- Understand parent-child relationships between tables.
- View database structures as interactive diagrams.
- Select one or multiple tables and explore their combined data.
- Build complex queries using visual controls.
- Perform joins, aggregations, filtering, sorting, grouping, and other SQL operations.
- Insert, update, delete, and manage records.
- Manage database structures.
- See generated SQL for every visual operation.
- Execute operations and inspect results.

The application must be powerful enough for experienced developers while remaining approachable for beginners.

This is not just a database visualization tool. It should eventually become a complete visual MySQL management environment.

# 2. TECHNOLOGY STACK

Use the following stack unless you identify a compelling technical reason to make a change. Explain any proposed deviation before implementing it.

### Frontend
- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- React Flow (@xyflow/react) for interactive database relationship diagrams.
- TanStack Table for advanced data tables.
- Zustand for application state management.
- Lucide React for icons.

### Backend
- Node.js
- TypeScript
- Express.js
- mysql2 for MySQL connectivity.
- Zod for request validation.

### Database
- MySQL 8.0+
- Support MySQL-compatible databases where possible.

### Testing
- Vitest
- React Testing Library
- Supertest
- Playwright for end-to-end testing.

### Development
- ESLint
- Prettier
- npm workspaces or another sensible monorepo arrangement.

Keep frontend and backend clearly separated.

Use modular architecture, reusable components, well-defined interfaces, and maintainable code.

# 3. DESIGN PHILOSOPHY

JARVIS must look and feel like a premium developer tool.

Design inspiration:
- Linear
- Raycast
- Vercel
- Supabase Dashboard
- Modern IDE interfaces.
- Marvel's JARVIS interface, particularly its sophisticated data visualization aesthetic.

Do not copy these products. Create a distinctive identity.

### Visual direction

- Dark-first interface.
- Deep charcoal and graphite backgrounds.
- Subtle blue/cyan accent colors.
- Restrained gradients.
- Elegant borders and shadows.
- Excellent typography.
- Minimal visual clutter.
- Smooth, meaningful animations.
- Consistent spacing and alignment.
- Carefully designed empty, loading, error, and success states.

Avoid:
- Generic admin dashboard templates.
- Excessively rounded cards.
- Unnecessary gradients.
- Overly bright colors.
- Excessive glassmorphism.
- Cluttered layouts.
- Placeholder buttons that do nothing.

The UI should feel like a professional product that developers would genuinely want to use every day.

Create a JARVIS design system with consistent:
- Colors
- Typography
- Spacing
- Components
- Buttons
- Inputs
- Dialogs
- Menus
- Tooltips
- Notifications
- Tables
- Panels

The application must be responsive, with desktop as the primary target.

# 4. APPLICATION STRUCTURE

Design a professional application shell.

### Main layout

**Left sidebar**
- JARVIS logo and branding.
- Database connections.
- Database explorer.
- Saved queries.
- Recent activity.
- Settings.

**Top navigation**
- Active connection.
- Active database.
- Search.
- Query execution controls where relevant.
- Notifications.
- User/application settings.

**Main workspace**

The main workspace should support multiple working areas or tabs.

Suggested workspaces:

1. Overview
2. Schema Explorer
3. Relationship Designer
4. Visual Query Builder
5. Data Explorer
6. Table Structure
7. Database Management

Do not force every feature into one screen. Design an intuitive navigation system.

# 5. DATABASE CONNECTION MANAGEMENT

The first essential functionality is connecting to a MySQL database.

Users should be able to provide:

- Connection name.
- Host.
- Port.
- Username.
- Password.
- Database name (optional).
- SSL configuration (optional).
- Connection timeout.

Provide:
- Test Connection.
- Connect.
- Disconnect.
- Edit Connection.
- Delete Connection.
- Save Connection.
- Recent Connections.

Support connections to local and remote MySQL servers.

After connecting:

1. Retrieve available databases.
2. Allow database selection.
3. Retrieve all tables and views.
4. Retrieve columns and their data types.
5. Retrieve primary keys.
6. Retrieve foreign keys.
7. Retrieve indexes.
8. Retrieve table relationships.
9. Retrieve relevant schema metadata.

Never expose database passwords to the frontend after initial submission.

Never log credentials.

Use parameterized queries, secure connection handling, proper validation, and safe credential storage. For the initial local deployment, implement a sensible secure credential-storage approach and document its limitations.

# 6. DATABASE EXPLORER

Build a powerful database explorer.

Display a hierarchical tree similar to:

Database
├── Tables
│   ├── ContactDetails
│   │   ├── Columns
│   │   ├── Indexes
│   │   ├── Constraints
│   │   └── Relationships
│   ├── ContactPhones
│   └── ContactEmails
├── Views
├── Stored Procedures
├── Functions
└── Triggers

Support expanding and collapsing nodes.

Users should be able to:
- Search tables.
- Search columns.
- Filter database objects.
- View table metadata.
- Right-click tables for contextual actions.
- Open tables in the workspace.
- Refresh schema information.

Display useful information such as row counts, column counts, primary keys, and storage engine wherever available.

# 7. RELATIONSHIP VISUALIZATION — CORE FEATURE

This is one of the most important features of JARVIS.

Create an interactive Entity Relationship Diagram (ERD).

Automatically identify relationships using:
- Foreign keys.
- Primary keys.
- Unique constraints.
- Relevant schema metadata.

Example database:

ContactDetails
- contact_id (PK)
- first_name
- last_name
- email

ContactPhones
- phone_id (PK)
- contact_id (FK)
- phone_number

ContactEmails
- email_id (PK)
- contact_id (FK)
- email_address

The visualization should automatically display:

ContactDetails
    ├── ContactPhones
    └── ContactEmails

Each table should appear as an interactive node.

Each node should display:
- Table name.
- Primary key.
- Important columns.
- Foreign key indicators.
- Column data types.
- Relationship indicators.

Relationship lines should communicate:
- One-to-one.
- One-to-many.
- Many-to-one.
- Many-to-many where identifiable.

Allow users to:

- Zoom in and out.
- Pan around.
- Drag and reposition tables.
- Expand and collapse table details.
- Select individual tables.
- Select multiple tables.
- Highlight parent tables.
- Highlight child tables.
- Highlight all connected tables.
- Focus on a selected table and its relationships.
- Hide unrelated tables.
- Fit the entire schema into the viewport.
- Search for a table and navigate to it.

When a user selects a table, show its immediate parents and children.

When selecting multiple tables, visually highlight their relationships.

IMPORTANT: Do not assume relationships merely because two columns have similar names. Distinguish actual foreign-key relationships from inferred relationships. Label inferred relationships clearly and never silently treat them as guaranteed constraints.

The visualization should remain usable with databases containing hundreds of tables.

# 8. VISUAL QUERY BUILDER — THE HEART OF JARVIS

This is the most important functional feature.

Users must be able to build SQL queries without manually writing SQL.

Create an intuitive visual query builder.

### Step 1: Select tables

Allow users to select:
- One table.
- Multiple tables.
- Related tables.
- Any manually selected combination of tables.

Provide two selection approaches:

1. Select tables from the database explorer.
2. Select tables directly from the relationship diagram.

Example:

ContactDetails + ContactPhones + ContactEmails

Display selected tables in a query workspace.

### Step 2: Select columns

Display available columns for each selected table.

Allow:
- Selecting individual columns.
- Selecting all columns.
- Selecting multiple columns.
- Removing columns.
- Renaming output columns using aliases.
- Selecting distinct values.

### Step 3: Configure joins

Support:

- INNER JOIN.
- LEFT JOIN.
- RIGHT JOIN.
- CROSS JOIN.
- SELF JOIN.
- Multiple joins.
- Multiple join conditions.
- Composite-key joins.
- Custom join conditions.

Automatically suggest joins using known foreign-key relationships.

Allow users to modify the suggested join configuration.

Show a visual representation of the join relationships.

### Step 4: Conditions

Build a powerful visual condition editor.

Support:

- Equals.
- Not equals.
- Greater than.
- Less than.
- Greater than or equal.
- Less than or equal.
- LIKE.
- NOT LIKE.
- IN.
- NOT IN.
- BETWEEN.
- NOT BETWEEN.
- IS NULL.
- IS NOT NULL.
- REGEXP.

Support:
- AND.
- OR.
- Nested conditions.
- Multiple condition groups.

Example:

ContactDetails.status = 'ACTIVE'
AND
(
    ContactPhones.country_code = '+91'
    OR
    ContactEmails.email_address LIKE '%@gmail.com'
)

Users must be able to create complex nested conditions using a visual interface.

### Step 5: Aggregations

Support:

- COUNT.
- SUM.
- AVG.
- MIN.
- MAX.
- COUNT DISTINCT.
- GROUP_CONCAT.
- Other supported MySQL aggregate functions.

Support:
- GROUP BY.
- HAVING.
- Multiple grouping columns.
- Multiple aggregate expressions.
- Aliases for aggregate results.

### Step 6: Sorting and pagination

Support:
- ORDER BY.
- Multiple sorting columns.
- ASC.
- DESC.
- LIMIT.
- OFFSET.

### Step 7: Advanced operations

Design the query engine to support future and advanced functionality:

- Subqueries.
- EXISTS.
- NOT EXISTS.
- UNION.
- UNION ALL.
- CASE expressions.
- Conditional expressions.
- Date and time functions.
- String functions.
- Mathematical functions.
- Window functions.
- Common Table Expressions (CTEs).
- Nested queries.
- MySQL JSON functions.

Implement these progressively. Do not fake support for features that are not implemented.

### Step 8: Query preview

Display the generated SQL in a read-only SQL preview panel.

Whenever users modify any visual configuration, regenerate the SQL.

Users should be able to inspect the SQL, copy it, and understand what JARVIS will execute.

The SQL must be generated by the backend query-generation engine or a well-defined shared query compiler, not assembled through unsafe string concatenation.

### Step 9: Execute query

Provide:
- Run Query.
- Cancel Query.
- Execution status.
- Execution duration.
- Number of rows returned.
- Error details.
- Result table.

Implement proper query cancellation and loading states.

# 9. DATA EXPLORER

Build an advanced table-data exploration interface.

When a user opens a table, display:

- Table name.
- Total rows where available.
- Columns.
- Data types.
- Primary and foreign keys.
- Index information.

Display records in an advanced grid.

Features:

- Pagination.
- Sorting.
- Filtering.
- Column visibility.
- Column resizing.
- Column reordering.
- Global search.
- Per-column search.
- Multiple filters.
- Export to CSV.
- Export to JSON.
- Copy selected cells.
- Select multiple rows.
- View individual records.

Support viewing large tables without loading every row into the browser.

Use server-side pagination, filtering, and sorting.

# 10. RECORD MANAGEMENT

Users should be able to manage records through the interface.

Implement:

- Insert record.
- Edit record.
- Delete record.
- Bulk insert where practical.
- Bulk update where practical.
- Bulk delete where practical.

Generate input forms dynamically based on column metadata.

Handle:
- Required columns.
- Default values.
- Auto-increment columns.
- NULL values.
- Data types.
- Foreign-key constraints.
- Unique constraints.

Use transactions where appropriate.

For destructive operations, provide clear confirmation dialogs and affected-row information.

Never execute destructive operations silently.

# 11. TABLE STRUCTURE MANAGEMENT

Allow users to visually inspect and manage table structures.

Support:

- View columns.
- Add column.
- Modify column.
- Rename column.
- Drop column.
- Add primary key.
- Add foreign key.
- Add unique constraint.
- Add indexes.
- Remove indexes.
- View CREATE TABLE information.
- Create new table.
- Rename table.
- Drop table.

Provide visual forms for each operation.

For structural changes:
- Preview the generated SQL.
- Explain potentially destructive changes.
- Require explicit confirmation.
- Handle errors properly.

Never silently alter an existing schema.

# 12. QUERY HISTORY AND SAVED QUERIES

Implement a query history system.

Store:
- Query name.
- Generated SQL.
- Query configuration.
- Connection reference.
- Database.
- Execution time.
- Execution status.
- Creation timestamp.

Allow:
- Viewing previous queries.
- Re-running queries.
- Saving queries.
- Renaming saved queries.
- Deleting saved queries.
- Organizing queries into folders.
- Searching query history.

Where possible, save the visual query configuration alongside the generated SQL so users can reopen and edit the query visually.

# 13. DATABASE OVERVIEW

Create a database overview dashboard.

Display:
- Total tables.
- Total views.
- Total columns.
- Total relationships.
- Database size where accessible.
- Largest tables.
- Tables without foreign-key relationships.
- Most connected tables.
- Recent query activity.

Include a small relationship overview visualization.

Use real database metadata. Never use fabricated statistics or hardcoded sample values in production views.

# 14. SECURITY AND RELIABILITY

Security is a fundamental requirement.

Implement:

- Parameterized SQL queries.
- Strict input validation.
- Safe SQL identifier handling.
- Protection against SQL injection.
- Secure connection management.
- Credential protection.
- Query execution timeouts.
- Connection pooling.
- Query cancellation.
- Error handling.
- Transaction handling.
- Safe handling of destructive operations.

Additional requirements:

1. Never concatenate untrusted user input into executable SQL.
2. SQL identifiers must be validated and correctly escaped.
3. Values must use parameter binding.
4. Restrict database operations according to the connected MySQL account's privileges.
5. Do not expose internal stack traces or credentials to users.
6. Do not execute arbitrary SQL through the visual query builder.
7. Treat database connections as untrusted external resources.
8. Make read-only mode available.
9. Clearly distinguish read and write operations.
10. Require explicit confirmation for destructive operations.

For the initial version, focus on a secure local-development deployment. Document what additional authentication, authorization, and deployment protections would be needed before exposing JARVIS to multiple users or the public internet.

# 15. ARCHITECTURE AND CODE QUALITY

Build a modular architecture.

Separate:

- UI components.
- Pages.
- Application state.
- API clients.
- Backend routes.
- Controllers.
- Services.
- Database connection management.
- Schema introspection.
- Relationship detection.
- Query builder.
- SQL generation.
- Query execution.
- Validation.
- Error handling.

Do not create enormous files containing unrelated functionality.

Avoid:
- Duplicated logic.
- Hardcoded database schemas.
- Fake API responses.
- Mock data in production functionality.
- Placeholder buttons.
- Unnecessary dependencies.
- Unmaintainable conditional logic.

Create reusable abstractions.

Define TypeScript types and interfaces properly.

Document complicated logic.

# 16. DEVELOPMENT PHASES

Do not attempt to build every feature in one giant implementation step.

Build JARVIS in carefully planned phases.

### Phase 1 — Foundation
- Initialize the project.
- Set up frontend and backend.
- Establish the design system.
- Create the application shell.
- Implement navigation.
- Configure development scripts.
- Establish testing infrastructure.

### Phase 2 — Database Connectivity
- MySQL connection form.
- Connection testing.
- Connection management.
- Database discovery.
- Schema introspection.

### Phase 3 — Schema Explorer
- Hierarchical database explorer.
- Table and column metadata.
- Foreign-key discovery.
- Index discovery.
- Schema search.

### Phase 4 — Relationship Visualization
- Interactive ERD.
- Table nodes.
- Relationship edges.
- Parent-child navigation.
- Table selection.
- Diagram interactions.

### Phase 5 — Visual Query Builder
- Table selection.
- Column selection.
- Joins.
- Conditions.
- Nested conditions.
- Aggregations.
- Grouping.
- Sorting.
- Pagination.
- SQL generation.
- Query execution.

### Phase 6 — Data Explorer
- Dynamic data grids.
- Server-side pagination.
- Filtering.
- Sorting.
- Search.
- Export.

### Phase 7 — Data Management
- Insert.
- Update.
- Delete.
- Bulk operations.
- Transactions.
- Confirmation workflows.

### Phase 8 — Schema Management
- Create and modify tables.
- Manage columns.
- Manage indexes.
- Manage relationships.
- Structural SQL previews.

### Phase 9 — Advanced Features
- Saved queries.
- Query history.
- Database overview.
- Advanced SQL operations.
- Performance improvements.

### Phase 10 — Quality and Release
- Comprehensive testing.
- Error handling.
- Security review.
- Performance optimization.
- Documentation.
- Production build.

# 17. DEVELOPMENT RULES FOR CLAUDE

Follow these rules throughout development.

**Rule 1: Think before coding.**

First inspect the project directory and understand that this is a new project.

Create a detailed implementation plan and architecture before writing the application.

**Rule 2: Build actual functionality.**

Every major button, menu, form, and interaction must perform its intended action.

Do not create visual placeholders and claim that the feature is implemented.

**Rule 3: Prioritize quality over speed.**

Do not sacrifice architecture, security, usability, or maintainability to implement features quickly.

**Rule 4: Verify everything.**

After implementing each phase:
- Run TypeScript checks.
- Run linting.
- Run relevant tests.
- Fix all discovered issues.
- Verify that existing functionality still works.

**Rule 5: Maintain documentation.**

Create and maintain:
- README.md
- ARCHITECTURE.md
- DEVELOPMENT.md
- API documentation.
- A development progress document.

**Rule 6: Maintain a development checklist.**

Create a TASKS.md file.

Track:
- Completed features.
- Features in progress.
- Pending features.
- Known bugs.
- Technical decisions.

Update it whenever meaningful work is completed.

**Rule 7: Do not silently compromise requirements.**

If a requested feature is technically difficult, explain the limitation and propose a proper implementation.

Do not pretend that unsupported MySQL functionality is supported.

**Rule 8: Maintain consistency.**

Follow the existing architecture and design system when adding new features.

Do not randomly change libraries or rewrite working modules without a good reason.

**Rule 9: Keep the application runnable.**

At every development stage, the project should remain in a working state.

**Rule 10: Be proactive.**

Make sensible engineering decisions without asking me about every small detail. Ask questions only when a decision genuinely requires my input.

# 18. FIRST TASK — START THE PROJECT

Since the directory is currently empty, begin by:

1. Inspecting the environment and project directory.
2. Preparing the complete technical architecture.
3. Establishing the folder structure.
4. Initializing the frontend and backend.
5. Installing the necessary dependencies.
6. Creating the initial design system.
7. Building the JARVIS application shell.
8. Implementing the first working screens.
9. Configuring development and testing commands.
10. Creating documentation and the development checklist.

Do not stop after generating an architecture document or a list of suggestions.

Actually initialize the project and begin implementation.

However, do not rush into implementing every feature at once. Complete the foundation properly, verify it, and then continue through the phases.

If a command requires my permission, explain what it does and request approval rather than bypassing the restriction.

# 19. DEFINITION OF SUCCESS

JARVIS will be successful when a developer can:

1. Open the web application.
2. Connect to an existing MySQL database using credentials.
3. Explore its complete schema.
4. Visually understand parent-child relationships.
5. Select related or unrelated tables.
6. Build complex queries without typing SQL.
7. Configure joins, conditions, aggregations, and sorting.
8. Preview the generated SQL.
9. Execute queries.
10. Explore and manage the resulting data.
11. Make database changes safely through the interface.

The experience should feel natural, powerful, and reliable.

**The ultimate principle: If something can be accomplished through MySQL, JARVIS should aim to provide an intuitive visual way to accomplish it.**

---

# YOUR FIRST RESPONSE

Before making changes, provide:

1. Your proposed architecture.
2. Your proposed folder structure.
3. Important technical decisions.
4. The implementation roadmap.
5. Any risks or architectural limitations you foresee.

Then start implementing Phase 1.

You are not just building another database client.

**You are building JARVIS.**
