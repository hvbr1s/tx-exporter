
import * as fs from 'fs';
import dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

const API_BASE_URL = 'https://api.fordefi.com/api/v1';
const MAX_REQUESTS_PER_MINUTE = 290;
const DELAY_BETWEEN_REQUESTS_MS = Math.ceil(60000 / MAX_REQUESTS_PER_MINUTE); // ~207ms
const FORDEFI_API_USER_TOKEN = process.env.FORDEFI_API_USER_TOKEN;

if (!FORDEFI_API_USER_TOKEN) {
  console.error('Error: TEMP_TOKEN environment variable is required');
  process.exit(1);
}

interface AbortResult {
  id: string;
  success: boolean;
  error?: string;
  statusCode?: number;
}

function parseTransactionIds(csvPath: string): string[] {
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim());
  
  const ids = lines
    .slice(1)
    .map(line => line.trim())
    .filter(id => id.length > 0);
  
  console.log(`Found ${ids.length} transaction IDs in CSV`);
  return ids;
}

  async function abortTransaction(transactionId: string): Promise<AbortResult> {
  const endpoint = `${API_BASE_URL}/transactions/${transactionId}/abort`;
  
  try {
    console.log(`Aborting transaction: ${transactionId}`);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FORDEFI_API_USER_TOKEN}`,
        'Accept': '*/*',
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      // Handle 204 No Content response (successful abort with no body)
      if (response.status === 204) {
        console.log(`✓ Successfully aborted transaction: ${transactionId} (204 No Content)`);
        return {
          id: transactionId,
          success: true,
          statusCode: 204
        };
      }
      
      // Handle other success responses (200, 201, etc.)
      const responseText = await response.text();
      console.log(`✓ Successfully aborted transaction: ${transactionId} (${response.status} ${response.statusText})`);
      if (responseText) {
        console.log(`  Response: ${responseText}`);
      }
      
      return {
        id: transactionId,
        success: true,
        statusCode: response.status
      };
    } else {
      const errorText = await response.text();
      console.error(`✗ Failed to abort transaction ${transactionId}: ${response.status} ${response.statusText}`);
      console.error(`  Error details: ${errorText}`);
      return {
        id: transactionId,
        success: false,
        error: `${response.status} ${response.statusText}: ${errorText}`,
        statusCode: response.status
      };
    }
  } catch (error) {
    console.error(`✗ Error aborting transaction ${transactionId}:`, error);
    return {
      id: transactionId,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function abortAllTransactions(transactionIds: string[]): Promise<AbortResult[]> {
  const results: AbortResult[] = [];
  const startTime = Date.now();
  
  console.log(`\nStarting to abort ${transactionIds.length} transactions...`);
  console.log(`Rate limit: ${MAX_REQUESTS_PER_MINUTE} requests/minute (${DELAY_BETWEEN_REQUESTS_MS}ms delay between requests)\n`);

  for (let i = 0; i < transactionIds.length; i++) {
    const transactionId = transactionIds[i];
    
    console.log(`[${i + 1}/${transactionIds.length}] Processing transaction...`);
    
    const result = await abortTransaction(transactionId!);
    results.push(result);
    
    if (i < transactionIds.length - 1) {
      await sleep(DELAY_BETWEEN_REQUESTS_MS);
    }
  }

  const endTime = Date.now();
  const totalTimeSeconds = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total transactions processed: ${results.length}`);
  console.log(`Successful: ${results.filter(r => r.success).length}`);
  console.log(`Failed: ${results.filter(r => !r.success).length}`);
  console.log(`Total time: ${totalTimeSeconds} seconds`);
  console.log('='.repeat(60));

  // Print failed transactions for review
  const failed = results.filter(r => !r.success);
  if (failed.length > 0) {
    console.log('\nFailed transactions:');
    failed.forEach(f => {
      console.log(`  - ${f.id}: ${f.error}`);
    });
  }

  return results;
}

function saveResults(results: AbortResult[], outputPath: string): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `abort_results_${timestamp}.json`;
  const filePath = path.join(outputPath, fileName);
  
  fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${filePath}`);
}

async function main() {
  try {
    const csvPath = path.join(__dirname, 'sample.csv');
    
    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV file not found: ${csvPath}`);
    }

    // Parse transaction IDs from CSV
    const transactionIds = parseTransactionIds(csvPath);
    
    if (transactionIds.length === 0) {
      console.log('No transaction IDs found in CSV file.');
      return;
    }

    console.log(`\nAbout to abort ${transactionIds.length} transactions.`);
    console.log(`This will take approximately ${Math.ceil(transactionIds.length * DELAY_BETWEEN_REQUESTS_MS / 1000)} seconds.\n`);
    
    const results = await abortAllTransactions(transactionIds);
    

    saveResults(results, __dirname);
    
    console.log('\nProcess completed!');
    
    if (results.some(r => !r.success)) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

