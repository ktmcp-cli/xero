![Banner](https://raw.githubusercontent.com/ktmcp-cli/xero/main/banner.svg)

> "Six months ago, everyone was talking about MCPs. And I was like, screw MCPs. Every MCP would be better as a CLI."
>
> — [Peter Steinberger](https://twitter.com/steipete), Founder of OpenClaw
> [Watch on YouTube (~2:39:00)](https://www.youtube.com/@lexfridman) | [Lex Fridman Podcast #491](https://lexfridman.com/peter-steinberger/)

# Xero CLI

A production-ready command-line interface for the [Xero](https://xero.com) accounting API. Manage invoices, contacts, accounts, bank transactions, and payments directly from your terminal.

> **Disclaimer**: This is an unofficial CLI tool and is not affiliated with, endorsed by, or supported by Xero Limited.

## Features

- **Invoices** — List, get, and create invoices with full line item support
- **Contacts** — Manage customers and suppliers
- **Accounts** — Browse your chart of accounts
- **Payments** — View payment history
- **Bank Transactions** — Reconcile and view bank transactions
- **OAuth 2.0 Auth** — Secure authentication with automatic token refresh
- **JSON output** — All commands support `--json` for scripting and piping
- **Colorized output** — Clean, readable terminal output with chalk

## Why CLI > MCP

MCP servers are complex, stateful, and require a running server process. A CLI is:

- **Simpler** — Just a binary you call directly
- **Composable** — Pipe output to `jq`, `grep`, `awk`, and other tools
- **Scriptable** — Use in shell scripts, CI/CD pipelines, cron jobs
- **Debuggable** — See exactly what's happening with `--json` flag
- **AI-friendly** — AI agents can call CLIs just as easily as MCPs, with less overhead

## Installation

```bash
npm install -g @ktmcp-cli/xero
```

## Authentication Setup

Xero uses OAuth 2.0. You'll need to create an app in the Xero Developer Portal.

### 1. Create a Xero App

1. Go to [developer.xero.com](https://developer.xero.com)
2. Click **New App**
3. Set redirect URI to `http://localhost:8765/callback`
4. Copy your **Client ID** and **Client Secret**

### 2. Configure the CLI

```bash
xero config set --client-id YOUR_CLIENT_ID --client-secret YOUR_CLIENT_SECRET
```

### 3. Login

```bash
xero auth login
```

This will open a browser window for OAuth consent. After approving, the CLI will automatically store your tokens and connect to your Xero organisation.

### 4. Verify

```bash
xero auth status
```

## Commands

### Configuration

```bash
# Set credentials
xero config set --client-id <id> --client-secret <secret>

# Show current config
xero config show
```

### Authentication

```bash
# Login via OAuth 2.0
xero auth login

# Check auth status
xero auth status
```

### Invoices

```bash
# List all invoices
xero invoices list

# Filter by status
xero invoices list --status DRAFT
xero invoices list --status AUTHORISED
xero invoices list --status PAID

# Limit results
xero invoices list --limit 20

# Get a specific invoice
xero invoices get <invoice-id>

# Create an invoice
xero invoices create \
  --contact <contact-id> \
  --line-items '[{"Description":"Consulting Services","Quantity":10,"UnitAmount":150,"AccountCode":"200"}]' \
  --status DRAFT
```

### Contacts

```bash
# List all contacts
xero contacts list

# Search contacts
xero contacts list --search "Acme Corp"

# Get a specific contact
xero contacts get <contact-id>

# Create a contact
xero contacts create --name "Acme Corp" --email "billing@acme.com"
xero contacts create --name "John Doe" --email "john@example.com" --phone "+1234567890"
```

### Accounts

```bash
# List chart of accounts
xero accounts list
```

### Payments

```bash
# List payments
xero payments list
```

### Bank Transactions

```bash
# List all bank transactions
xero bank-transactions list

# Filter by bank account
xero bank-transactions list --account-id <account-id>
```

## JSON Output

All commands support `--json` for machine-readable output:

```bash
# Get all invoices as JSON
xero invoices list --json

# Pipe to jq for filtering
xero invoices list --json | jq '.[] | select(.Status == "DRAFT") | {id: .InvoiceID, total: .Total}'

# Get contact details
xero contacts get <id> --json | jq '{name: .Name, email: .EmailAddress}'
```

## Examples

### Create and track an invoice

```bash
# First, find the contact
xero contacts list --search "Acme"

# Create a draft invoice
xero invoices create \
  --contact abc123-def456 \
  --line-items '[
    {"Description":"Web Development","Quantity":40,"UnitAmount":125,"AccountCode":"200"},
    {"Description":"Hosting (monthly)","Quantity":1,"UnitAmount":50,"AccountCode":"200"}
  ]'

# List draft invoices
xero invoices list --status DRAFT
```

### Reconcile bank transactions

```bash
# List all bank accounts (from accounts)
xero accounts list --json | jq '.[] | select(.Type == "BANK") | {code: .Code, name: .Name, id: .AccountID}'

# List transactions for a specific account
xero bank-transactions list --account-id <account-id>
```

## Contributing

Issues and pull requests are welcome at [github.com/ktmcp-cli/xero](https://github.com/ktmcp-cli/xero).

## License

MIT — see [LICENSE](LICENSE) for details.

---

Part of the [KTMCP CLI](https://killthemcp.com) project — replacing MCPs with simple, composable CLIs.


---

## Support KTMCP

If you find this CLI useful, we'd greatly appreciate your support! Share your experience on:
- Reddit
- Twitter/X
- Hacker News

**Incentive:** Users who can demonstrate that their support/advocacy helped advance KTMCP will have their feature requests and issues prioritized.

Just be mindful - these are real accounts and real communities. Authentic mentions and genuine recommendations go a long way!

## Support This Project

If you find this CLI useful, we'd appreciate support across Reddit, Twitter, Hacker News, or Moltbook. Please be mindful - these are real community accounts. Contributors who can demonstrate their support helped advance KTMCP will have their PRs and feature requests prioritized.
