import * as fs from "fs";
import dotenv from 'dotenv';

dotenv.config()

const BASE_URL = "https://api.fordefi.com/api/v1/assets/owned-assets";
let AUTH_TOKEN: string
//AUTH_TOKEN = process.env.TEMP_TOKEN || "";
AUTH_TOKEN = process.env.FORDEFI_API_USER_TOKEN || "";

if (!AUTH_TOKEN) {
  console.error("Error: FORDEFI_TOKEN environment variable is required");
  process.exit(1);
}

async function fetchAllAssets() {
  const allAssets: any[] = [];
  let page = 1;
  const size = 100;
  while (true) {
    let url;
    url = `${BASE_URL}?is_hidden=false&size=${size}&page=${page}`;
    console.log(`Fetching page ${page}...`);

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const assets = data.owned_assets || data.items || data.data || [];

    if (assets.length === 0) {
      break;
    }

    allAssets.push(...assets);
    console.log(`  Got ${assets.length} assets (total: ${allAssets.length})`);

    if (assets.length < size) {
      break;
    }

    page++;
  }

  fs.writeFileSync("assets.json", JSON.stringify(allAssets, null, 2));
  console.log(`\nDone! Wrote ${allAssets.length} assets to assets.json`);
}

fetchAllAssets().catch(console.error);
