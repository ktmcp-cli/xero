import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createServer } from 'http';
import { getConfig, setConfig, isConfigured } from './config.js';
import {
  exchangeCodeForTokens,
  getConnections,
  listInvoices,
  getInvoice,
  createInvoice,
  listContacts,
  getContact,
  createContact,
  listAccounts,
  listPayments,
  listBankTransactions
} from './api.js';

const program = new Command();

// ============================================================
// Helpers
// ============================================================

function printSuccess(message) {
  console.log(chalk.green('✓') + ' ' + message);
}

function printError(message) {
  console.error(chalk.red('✗') + ' ' + message);
}

function printTable(data, columns) {
  if (!data || data.length === 0) {
    console.log(chalk.yellow('No results found.'));
    return;
  }

  // Calculate column widths
  const widths = {};
  columns.forEach(col => {
    widths[col.key] = col.label.length;
    data.forEach(row => {
      const val = String(col.format ? col.format(row[col.key], row) : (row[col.key] ?? ''));
      if (val.length > widths[col.key]) widths[col.key] = val.length;
    });
    // Cap column width at 40
    widths[col.key] = Math.min(widths[col.key], 40);
  });

  // Header
  const header = columns.map(col => col.label.padEnd(widths[col.key])).join('  ');
  console.log(chalk.bold(chalk.cyan(header)));
  console.log(chalk.dim('─'.repeat(header.length)));

  // Rows
  data.forEach(row => {
    const line = columns.map(col => {
      const val = String(col.format ? col.format(row[col.key], row) : (row[col.key] ?? ''));
      return val.substring(0, widths[col.key]).padEnd(widths[col.key]);
    }).join('  ');
    console.log(line);
  });

  console.log(chalk.dim(`\n${data.length} result(s)`));
}

function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

async function withSpinner(message, fn) {
  const spinner = ora(message).start();
  try {
    const result = await fn();
    spinner.stop();
    return result;
  } catch (error) {
    spinner.stop();
    throw error;
  }
}

function requireAuth() {
  if (!isConfigured()) {
    printError('Xero credentials not configured.');
    console.log('\nRun the following to configure:');
    console.log(chalk.cyan('  xero config set --client-id <id> --client-secret <secret>'));
    console.log(chalk.cyan('  xero auth login'));
    process.exit(1);
  }
}

// ============================================================
// Program metadata
// ============================================================

program
  .name('xero')
  .description(chalk.bold('Xero CLI') + ' - Cloud accounting from your terminal')
  .version('1.0.0');

// ============================================================
// CONFIG
// ============================================================

const configCmd = program.command('config').description('Manage CLI configuration');

configCmd
  .command('set')
  .description('Set configuration values')
  .option('--client-id <id>', 'Xero OAuth2 Client ID')
  .option('--client-secret <secret>', 'Xero OAuth2 Client Secret')
  .option('--tenant-id <id>', 'Xero Tenant/Organisation ID')
  .action((options) => {
    if (options.clientId) {
      setConfig('clientId', options.clientId);
      printSuccess(`Client ID set`);
    }
    if (options.clientSecret) {
      setConfig('clientSecret', options.clientSecret);
      printSuccess(`Client Secret set`);
    }
    if (options.tenantId) {
      setConfig('tenantId', options.tenantId);
      printSuccess(`Tenant ID set`);
    }
    if (!options.clientId && !options.clientSecret && !options.tenantId) {
      printError('No options provided. Use --client-id, --client-secret, or --tenant-id');
    }
  });

configCmd
  .command('show')
  .description('Show current configuration')
  .action(() => {
    const clientId = getConfig('clientId');
    const clientSecret = getConfig('clientSecret');
    const tenantId = getConfig('tenantId');
    const hasToken = !!getConfig('accessToken');
    const tokenExpiry = getConfig('tokenExpiry');

    console.log(chalk.bold('\nXero CLI Configuration\n'));
    console.log('Client ID:     ', clientId ? chalk.green(clientId) : chalk.red('not set'));
    console.log('Client Secret: ', clientSecret ? chalk.green('*'.repeat(8)) : chalk.red('not set'));
    console.log('Tenant ID:     ', tenantId ? chalk.green(tenantId) : chalk.yellow('not set (run: xero auth login)'));
    console.log('Access Token:  ', hasToken ? chalk.green('set') : chalk.red('not set'));
    if (tokenExpiry) {
      const expiry = new Date(tokenExpiry);
      const isValid = tokenExpiry > Date.now();
      console.log('Token Expiry:  ', isValid ? chalk.green(expiry.toLocaleString()) : chalk.red(`expired (${expiry.toLocaleString()})`));
    }
    console.log('');
  });

// ============================================================
// AUTH
// ============================================================

const authCmd = program.command('auth').description('Manage authentication');

authCmd
  .command('login')
  .description('Authenticate with Xero via OAuth 2.0')
  .option('--port <port>', 'Local callback port', '8765')
  .action(async (options) => {
    if (!isConfigured()) {
      printError('Please configure your credentials first:');
      console.log(chalk.cyan('  xero config set --client-id <id> --client-secret <secret>'));
      process.exit(1);
    }

    const clientId = getConfig('clientId');
    const port = parseInt(options.port);
    const redirectUri = `http://localhost:${port}/callback`;

    const authUrl = new URL('https://login.xero.com/identity/connect/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', 'offline_access accounting.transactions accounting.contacts accounting.settings');
    authUrl.searchParams.set('state', Math.random().toString(36).substring(7));

    console.log(chalk.bold('\nXero OAuth 2.0 Login\n'));
    console.log('Open this URL in your browser to authenticate:\n');
    console.log(chalk.cyan(authUrl.toString()));
    console.log('\nWaiting for callback on port', port, '...\n');

    // Start a local HTTP server to receive the callback
    await new Promise((resolve, reject) => {
      const server = createServer(async (req, res) => {
        const url = new URL(req.url, `http://localhost:${port}`);

        if (url.pathname === '/callback') {
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h1>Authentication Failed</h1><p>Error: ' + error + '</p>');
            server.close();
            reject(new Error(`OAuth error: ${error}`));
            return;
          }

          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h1>Authentication Failed</h1><p>No code received.</p>');
            server.close();
            reject(new Error('No authorization code received'));
            return;
          }

          try {
            const spinner = ora('Exchanging code for tokens...').start();
            await exchangeCodeForTokens(code, redirectUri);
            spinner.succeed('Tokens obtained');

            // Get and select tenant
            const connectionsSpinner = ora('Fetching organisations...').start();
            const connections = await getConnections();
            connectionsSpinner.stop();

            if (connections && connections.length > 0) {
              const tenant = connections[0];
              setConfig('tenantId', tenant.tenantId);
              printSuccess(`Connected to organisation: ${chalk.bold(tenant.tenantName)}`);
              if (connections.length > 1) {
                console.log(chalk.yellow(`\nMultiple organisations found. Using first one: ${tenant.tenantName}`));
                console.log('To use a different organisation, run:');
                console.log(chalk.cyan('  xero config set --tenant-id <tenant-id>'));
                console.log('\nAvailable organisations:');
                connections.forEach(c => console.log(`  ${c.tenantId}  ${c.tenantName}`));
              }
            }

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h1>Authentication Successful!</h1><p>You can close this tab and return to your terminal.</p>');
            server.close();
            resolve();
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('<h1>Authentication Failed</h1><p>' + err.message + '</p>');
            server.close();
            reject(err);
          }
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      server.listen(port, () => {});
      server.on('error', reject);
    });
  });

authCmd
  .command('status')
  .description('Check authentication status')
  .action(async () => {
    const spinner = ora('Checking auth status...').start();
    try {
      const connections = await getConnections();
      spinner.stop();
      printSuccess('Authenticated with Xero');
      if (connections && connections.length > 0) {
        console.log('\nConnected organisations:');
        connections.forEach(c => {
          const current = c.tenantId === getConfig('tenantId');
          console.log(`  ${current ? chalk.green('*') : ' '} ${c.tenantId}  ${chalk.bold(c.tenantName)}`);
        });
      }
    } catch (error) {
      spinner.stop();
      printError('Not authenticated: ' + error.message);
      process.exit(1);
    }
  });

// ============================================================
// INVOICES
// ============================================================

const invoicesCmd = program.command('invoices').description('Manage invoices');

invoicesCmd
  .command('list')
  .description('List invoices')
  .option('--status <status>', 'Filter by status (DRAFT|SUBMITTED|AUTHORISED|PAID|VOIDED)')
  .option('--limit <n>', 'Maximum number of results', '50')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    requireAuth();
    try {
      const invoices = await withSpinner('Fetching invoices...', () =>
        listInvoices({ status: options.status, limit: parseInt(options.limit) })
      );

      if (options.json) {
        printJson(invoices);
        return;
      }

      printTable(invoices, [
        { key: 'InvoiceID', label: 'ID', format: (v) => v?.substring(0, 8) + '...' },
        { key: 'InvoiceNumber', label: 'Number' },
        { key: 'Contact', label: 'Contact', format: (v) => v?.Name || '' },
        { key: 'Status', label: 'Status' },
        { key: 'Total', label: 'Total', format: (v) => v?.toFixed(2) || '0.00' },
        { key: 'CurrencyCode', label: 'Currency' },
        { key: 'DueDate', label: 'Due Date', format: (v) => v ? v.replace(/\/Date\((\d+)[\+\-]?\d*\)\//, (_, ts) => new Date(parseInt(ts)).toLocaleDateString()) : '' }
      ]);
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

invoicesCmd
  .command('get <invoice-id>')
  .description('Get a specific invoice')
  .option('--json', 'Output as JSON')
  .action(async (invoiceId, options) => {
    requireAuth();
    try {
      const invoice = await withSpinner('Fetching invoice...', () => getInvoice(invoiceId));

      if (!invoice) {
        printError('Invoice not found');
        process.exit(1);
      }

      if (options.json) {
        printJson(invoice);
        return;
      }

      console.log(chalk.bold('\nInvoice Details\n'));
      console.log('Invoice ID:    ', chalk.cyan(invoice.InvoiceID));
      console.log('Number:        ', invoice.InvoiceNumber || 'N/A');
      console.log('Type:          ', invoice.Type);
      console.log('Status:        ', chalk.bold(invoice.Status));
      console.log('Contact:       ', invoice.Contact?.Name || 'N/A');
      console.log('Reference:     ', invoice.Reference || 'N/A');
      console.log('Currency:      ', invoice.CurrencyCode);
      console.log('Sub Total:     ', invoice.SubTotal?.toFixed(2));
      console.log('Total Tax:     ', invoice.TotalTax?.toFixed(2));
      console.log('Total:         ', chalk.bold(invoice.Total?.toFixed(2)));
      console.log('Amount Due:    ', chalk.red(invoice.AmountDue?.toFixed(2)));
      console.log('Amount Paid:   ', chalk.green(invoice.AmountPaid?.toFixed(2)));

      if (invoice.LineItems && invoice.LineItems.length > 0) {
        console.log(chalk.bold('\nLine Items:\n'));
        printTable(invoice.LineItems, [
          { key: 'Description', label: 'Description' },
          { key: 'Quantity', label: 'Qty', format: (v) => v?.toString() || '1' },
          { key: 'UnitAmount', label: 'Unit Price', format: (v) => v?.toFixed(2) || '0.00' },
          { key: 'TaxType', label: 'Tax Type' },
          { key: 'LineAmount', label: 'Amount', format: (v) => v?.toFixed(2) || '0.00' }
        ]);
      }
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

invoicesCmd
  .command('create')
  .description('Create a new invoice')
  .requiredOption('--contact <id>', 'Contact ID')
  .requiredOption('--line-items <json>', 'Line items as JSON array, e.g. \'[{"Description":"Services","Quantity":1,"UnitAmount":100,"AccountCode":"200"}]\'')
  .option('--type <type>', 'Invoice type (ACCREC|ACCPAY)', 'ACCREC')
  .option('--status <status>', 'Invoice status (DRAFT|SUBMITTED|AUTHORISED)', 'DRAFT')
  .option('--due-date <date>', 'Due date (YYYY-MM-DD)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    requireAuth();
    let lineItems;
    try {
      lineItems = JSON.parse(options.lineItems);
    } catch {
      printError('Invalid JSON for --line-items');
      process.exit(1);
    }

    try {
      const invoice = await withSpinner('Creating invoice...', () =>
        createInvoice({
          contactId: options.contact,
          lineItems,
          type: options.type,
          status: options.status,
          dueDate: options.dueDate
        })
      );

      if (options.json) {
        printJson(invoice);
        return;
      }

      printSuccess(`Invoice created: ${chalk.bold(invoice.InvoiceID)}`);
      console.log('Number:  ', invoice.InvoiceNumber || 'N/A');
      console.log('Status:  ', invoice.Status);
      console.log('Total:   ', invoice.Total?.toFixed(2), invoice.CurrencyCode);
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

// ============================================================
// CONTACTS
// ============================================================

const contactsCmd = program.command('contacts').description('Manage contacts');

contactsCmd
  .command('list')
  .description('List contacts')
  .option('--search <name>', 'Search by name or email')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    requireAuth();
    try {
      const contacts = await withSpinner('Fetching contacts...', () =>
        listContacts({ search: options.search })
      );

      if (options.json) {
        printJson(contacts);
        return;
      }

      printTable(contacts, [
        { key: 'ContactID', label: 'ID', format: (v) => v?.substring(0, 8) + '...' },
        { key: 'Name', label: 'Name' },
        { key: 'EmailAddress', label: 'Email' },
        { key: 'IsSupplier', label: 'Supplier', format: (v) => v ? 'Yes' : 'No' },
        { key: 'IsCustomer', label: 'Customer', format: (v) => v ? 'Yes' : 'No' },
        { key: 'ContactStatus', label: 'Status' }
      ]);
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

contactsCmd
  .command('get <contact-id>')
  .description('Get a specific contact')
  .option('--json', 'Output as JSON')
  .action(async (contactId, options) => {
    requireAuth();
    try {
      const contact = await withSpinner('Fetching contact...', () => getContact(contactId));

      if (!contact) {
        printError('Contact not found');
        process.exit(1);
      }

      if (options.json) {
        printJson(contact);
        return;
      }

      console.log(chalk.bold('\nContact Details\n'));
      console.log('Contact ID:    ', chalk.cyan(contact.ContactID));
      console.log('Name:          ', chalk.bold(contact.Name));
      console.log('Email:         ', contact.EmailAddress || 'N/A');
      console.log('Status:        ', contact.ContactStatus);
      console.log('Is Customer:   ', contact.IsCustomer ? chalk.green('Yes') : 'No');
      console.log('Is Supplier:   ', contact.IsSupplier ? chalk.green('Yes') : 'No');

      if (contact.Phones && contact.Phones.length > 0) {
        const defaultPhone = contact.Phones.find(p => p.PhoneType === 'DEFAULT');
        if (defaultPhone?.PhoneNumber) {
          console.log('Phone:         ', defaultPhone.PhoneNumber);
        }
      }

      if (contact.Addresses && contact.Addresses.length > 0) {
        const postal = contact.Addresses.find(a => a.AddressType === 'POBOX');
        if (postal?.City) {
          console.log('City:          ', postal.City);
          console.log('Country:       ', postal.Country || 'N/A');
        }
      }
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

contactsCmd
  .command('create')
  .description('Create a new contact')
  .requiredOption('--name <name>', 'Contact name')
  .option('--email <email>', 'Email address')
  .option('--phone <phone>', 'Phone number')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    requireAuth();
    try {
      const contact = await withSpinner('Creating contact...', () =>
        createContact({ name: options.name, email: options.email, phone: options.phone })
      );

      if (options.json) {
        printJson(contact);
        return;
      }

      printSuccess(`Contact created: ${chalk.bold(contact.Name)}`);
      console.log('Contact ID: ', contact.ContactID);
      if (contact.EmailAddress) console.log('Email:      ', contact.EmailAddress);
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

// ============================================================
// ACCOUNTS
// ============================================================

const accountsCmd = program.command('accounts').description('Manage accounts');

accountsCmd
  .command('list')
  .description('List chart of accounts')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    requireAuth();
    try {
      const accounts = await withSpinner('Fetching accounts...', () => listAccounts());

      if (options.json) {
        printJson(accounts);
        return;
      }

      printTable(accounts, [
        { key: 'Code', label: 'Code' },
        { key: 'Name', label: 'Name' },
        { key: 'Type', label: 'Type' },
        { key: 'Class', label: 'Class' },
        { key: 'Status', label: 'Status' },
        { key: 'Description', label: 'Description' }
      ]);
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

// ============================================================
// PAYMENTS
// ============================================================

const paymentsCmd = program.command('payments').description('Manage payments');

paymentsCmd
  .command('list')
  .description('List payments')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    requireAuth();
    try {
      const payments = await withSpinner('Fetching payments...', () => listPayments());

      if (options.json) {
        printJson(payments);
        return;
      }

      printTable(payments, [
        { key: 'PaymentID', label: 'ID', format: (v) => v?.substring(0, 8) + '...' },
        { key: 'Invoice', label: 'Invoice', format: (v) => v?.InvoiceNumber || v?.InvoiceID?.substring(0, 8) + '...' || 'N/A' },
        { key: 'Account', label: 'Account', format: (v) => v?.Name || 'N/A' },
        { key: 'Amount', label: 'Amount', format: (v) => v?.toFixed(2) || '0.00' },
        { key: 'CurrencyRate', label: 'Currency Rate', format: (v) => v?.toString() || '1' },
        { key: 'Status', label: 'Status' },
        { key: 'PaymentType', label: 'Type' }
      ]);
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

// ============================================================
// BANK TRANSACTIONS
// ============================================================

const bankCmd = program.command('bank-transactions').description('View bank transactions');

bankCmd
  .command('list')
  .description('List bank transactions')
  .option('--account-id <id>', 'Filter by bank account ID')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    requireAuth();
    try {
      const transactions = await withSpinner('Fetching bank transactions...', () =>
        listBankTransactions({ accountId: options.accountId })
      );

      if (options.json) {
        printJson(transactions);
        return;
      }

      printTable(transactions, [
        { key: 'BankTransactionID', label: 'ID', format: (v) => v?.substring(0, 8) + '...' },
        { key: 'Type', label: 'Type' },
        { key: 'Contact', label: 'Contact', format: (v) => v?.Name || 'N/A' },
        { key: 'BankAccount', label: 'Account', format: (v) => v?.Name || 'N/A' },
        { key: 'Total', label: 'Total', format: (v) => v?.toFixed(2) || '0.00' },
        { key: 'Status', label: 'Status' }
      ]);
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

// ============================================================
// Parse
// ============================================================

program.parse(process.argv);

if (process.argv.length <= 2) {
  program.help();
}
