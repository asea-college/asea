# ASEA Budget Management

Live page: https://asea-college.github.io/asea/budget/

## Architecture

- Static web interface hosted in the `asea-college/asea` GitHub Pages site.
- Authentication, budget records and approval actions use the school's existing Supabase project.
- Budget records are isolated in `budget_*` tables with Row Level Security policies.
- A separate `budget_private` schema holds the one-time administrator activation code.

## First-time setup

1. Open the live page and create the first account using the school's email.
2. Sign in after any email verification prompt.
3. On the pending-access screen, enter the one-time administrator activation code provided to the project owner.
4. In **사용자·부서 관리**, assign department and role to each registered staff account.
5. Open **예산 항목** and choose **엑셀 붙여넣기** to load source-sheet rows. Paste tab-separated columns in this order: account code, account name, category, amount in won, basis. Choose fiscal year and department before applying. Matching department/year/account-code rows are updated.

Roles include staff requester, department budget manager, department head, budget administrator and executive reviewer.

## Workflow

Department staff submit requests with quantity, unit price and written basis. Department and budget reviewers record their decisions. Approved requests produce a two-column HTML block for the Café24 NNEditor: square QR code at left and Korean-won budget basis at right. Staff paste it into the groupware editor and record the groupware document number or link in this app. Authorized staff then record actual expenditures; the history and remaining amount update in the app.

## Integration boundary

The current implementation copies NNEditor-compatible HTML and records groupware document identifiers. It does not submit a draft or approval action directly to Café24: no authenticated Café24 groupware API connection has been configured. The QR page exposes only the approved request summary and expenditure totals through a public token.

This is an initial operational draft. Review department names, roles, approval routing and budget source sheets before broad staff use.
