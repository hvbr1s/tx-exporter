
import * as fs from 'fs';
import dotenv from 'dotenv';
import * as path from 'path';
import { ExportResponse } from './interface'

dotenv.config()

const API_BASE_URL = 'https://api.fordefi.com/api/v1';
const EXPORT_PARAMS = '/vaults/export_async'
const POLL_INTERVAL_MS = 2000;
const MAX_DOWNLOAD_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const FORDEFI_API_USER_TOKEN = process.env.FORDEFI_API_USER_TOKEN;
if (!FORDEFI_API_USER_TOKEN) {
  console.error('Error: FORDEFI_API_USER_TOKEN environment variable is required');
  process.exit(1);
}

async function requestExport(): Promise<string> {
  console.log('Requesting new transaction export...');
  const endpoint = `${API_BASE_URL}${EXPORT_PARAMS}`
  console.log(`Pinging endpoint`, endpoint)
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${FORDEFI_API_USER_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to request export: ${response.status} ${response.statusText}. Response: ${errorText}`);
  }

  const responseText = await response.text();
  console.log('Response body:', responseText);

  if (!responseText) {
    throw new Error('Empty response body received from API');
  }

  const data: ExportResponse = JSON.parse(responseText);
  console.log(`Export requested successfully. ID: ${data.id}`);
  console.log(`Initial state: ${data.state}`);
  
  return data.id;
}

async function pollExportStatus(exportId: string): Promise<ExportResponse> {
  console.log('Polling export status...');
  let attempt = 1;
  while (true) {
    const response = await fetch(`${API_BASE_URL}/exports/${exportId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${FORDEFI_API_USER_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to check export status: ${response.status} ${response.statusText}`);
    }
    const data: ExportResponse = await response.json();
    console.log(`Attempt ${attempt}: Export state is "${data.state}"`);
    if (data.state === 'ready') {
      console.log('Export is ready for download!');
      console.log(`Total items: ${data.total_items_count}`);
      console.log(`Successful items: ${data.successful_items_count}`);
      console.log(`Failed items: ${data.failed_items_count}`);
      return data;
    }
    if (data.state === 'error') {
      console.error('Export failed with error state');
      console.error('Full export response:', JSON.stringify(data, null, 2));
      throw new Error(`Export failed - State: ${data.state}, Export ID: ${exportId}, Response: ${JSON.stringify(data)}`);
    }
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    attempt++;
  }
}

function extractFilename(url: string): string {
  try {
    const urlObj = new URL(url);
    const contentDisposition = urlObj.searchParams.get('response-content-disposition');  
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (filenameMatch && filenameMatch[1]) {
        return filenameMatch[1].replace(/['"]/g, '');
      }
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `fordefi_transactions_${timestamp}.csv`;
  } catch {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `fordefi_transactions_${timestamp}.csv`;
  }
}


async function downloadFile(downloadUrl: string, exportId?: string): Promise<void> {
  console.log('Starting file download...');
  console.log('Download URL: ', downloadUrl)
  for (let attempt = 1; attempt <= MAX_DOWNLOAD_RETRIES; attempt++) {
    try {
      console.log(`Download attempt ${attempt}/${MAX_DOWNLOAD_RETRIES}`);
      const response = await fetch(downloadUrl);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        const fileName = extractFilename(downloadUrl);
        const filePath = path.join(__dirname, fileName);
        
        fs.writeFileSync(filePath, Buffer.from(buffer));
        
        console.log(`File downloaded successfully: ${filePath}`);
        console.log(`File size: ${buffer.byteLength} bytes`);
        console.log(`Filename: ${fileName}`);
        return;
      }
      if (response.status === 403) {
        console.log(`Download failed with 403 Forbidden (attempt ${attempt}/${MAX_DOWNLOAD_RETRIES})`);
        if (exportId && attempt < MAX_DOWNLOAD_RETRIES) {
          console.log('Attempting to get a fresh download URL...');
          try {
            const exportResponse = await fetch(`${API_BASE_URL}/exports/${exportId}`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${FORDEFI_API_USER_TOKEN}`,
                'Content-Type': 'application/json'
              }
            });   
            if (exportResponse.ok) {
              const exportData: ExportResponse = await exportResponse.json();
              if (exportData.download_url && exportData.download_url !== downloadUrl) {
                console.log('Got fresh download URL, retrying...');
                downloadUrl = exportData.download_url;
              }
            }
          } catch (error) {
            console.log('Failed to get fresh download URL:', error);
          }
        }
        if (attempt < MAX_DOWNLOAD_RETRIES) {
          console.log(`Waiting ${RETRY_DELAY_MS}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          continue;
        }
      }
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    } catch (error) {
      if (attempt === MAX_DOWNLOAD_RETRIES) {
        throw error;
      }
      console.log(`Download attempt ${attempt} failed:`, error);
      console.log(`Waiting ${RETRY_DELAY_MS}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

async function main() {
  try {
    const exportId = await requestExport();
    const exportData = await pollExportStatus(exportId);
    if (!exportData.download_url) {
      throw new Error('Download URL not available in export response');
    }
    await downloadFile(exportData.download_url, exportId);
    console.log('Process completed successfully!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();