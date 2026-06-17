/**
 * PropertyFinder Automation - Express Backend Server
 * Handles:
 *  - MongoDB Atlas Connection
 *  - Scraping child process invocation and live log streaming via SSE
 *  - Daily Autopilot scheduler using node-cron
 *  - REST APIs for metrics, property listings, and Excel file download
 */

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const cron = require("node-cron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const dns = require("dns");

// Force Google DNS resolution on Windows to avoid Atlas SRV lookup failures
dns.setServers(["8.8.8.8"]);

const app = express();
app.use(cors());
app.use(express.json());

require("dotenv").config();

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/propertyfinder";
const EXCEL_PATH = path.join(__dirname, "propertyfinder_detailed_properties.xlsx");
const CONFIG_PATH = path.join(__dirname, "config.json");
const LOGS_PATH = path.join(__dirname, "scraper.log");

// Import Mongoose Property model
const Property = require("./models/Property");

// Global Scraper State
let isScraping = false;
let currentProcess = null;
let logBuffer = [];
const logBufferLimit = 1000;
let sseClients = [];
let cronJob = null;

// Load config or use defaults
let config = {
  autopilot: false,
  runTime: "02:00",
  pages: 3
};

if (fs.existsSync(CONFIG_PATH)) {
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch (err) {
    console.error("⚠️ Failed to parse config.json, using defaults.");
  }
}

// Ensure log file exists
if (!fs.existsSync(LOGS_PATH)) {
  fs.writeFileSync(LOGS_PATH, "");
} else {
  // Pre-load recent log lines into memory
  try {
    const lines = fs.readFileSync(LOGS_PATH, "utf-8").split("\n");
    logBuffer = lines.slice(-logBufferLimit);
  } catch (err) {
    console.error("⚠️ Failed to read scraper.log history.");
  }
}

// Helper to write logs
function addLog(message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}`;
  console.log(logLine);

  logBuffer.push(logLine);
  if (logBuffer.length > logBufferLimit) {
    logBuffer.shift();
  }

  // Append to log file
  fs.appendFile(LOGS_PATH, logLine + "\n", (err) => {
    if (err) console.error("⚠️ Failed to write to scraper.log", err);
  });

  // Broadcast to SSE clients
  sseClients.forEach(client => {
    client.res.write(`data: ${JSON.stringify({ log: logLine })}\n\n`);
  });
}

// Connect to MongoDB Atlas
mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log("✅ Successfully connected to MongoDB Atlas.");
    console.log("Database:", mongoose.connection.db.databaseName);
    console.log("Collection:", Property.collection.collectionName);

    const count = await Property.countDocuments({});
    console.log("Property Count:", count);

    const sample = await Property.findOne({});
    console.log("Sample Property:", sample ? JSON.stringify(sample) : "None found");

    const jsonPath = path.join(__dirname, "new_listings.json");

    if (fs.existsSync(jsonPath)) {
      addLog("ℹ️ Found pending new_listings.json on startup. Processing database import...");
      await processScrapedData();
    }
  })
  .catch(err => console.error("❌ MongoDB Atlas Connection Error:", err));

// Helpers for Data Cleansing & Formatting (from import.js)
function cleanPrice(priceVal) {
  if (!priceVal) return { price: 0, frequency: "" };
  const rawStr = priceVal.toString().trim();
  const cleanStr = rawStr.replace(/AED/gi, "").replace(/,/g, "").trim();
  const parts = cleanStr.split("/");
  const numericPrice = parseFloat(parts[0]);
  const freq = parts[1] ? parts[1].toLowerCase().trim() : "";
  return {
    price: isNaN(numericPrice) ? 0 : numericPrice,
    frequency: freq
  };
}

function cleanNumber(value, suffixToRemove = "") {
  if (value === undefined || value === null) return 0;
  let str = value.toString().trim();
  if (suffixToRemove) {
    const regex = new RegExp(suffixToRemove, "gi");
    str = str.replace(regex, "");
  }
  const num = parseFloat(str.replace(/,/g, ""));
  return isNaN(num) ? 0 : num;
}

function parseBeds(bedsVal) {
  if (bedsVal === undefined || bedsVal === null) return undefined;
  const str = bedsVal.toString().trim().toLowerCase();
  if (str === "studio") return "studio";
  const num = parseInt(str, 10);
  if (isNaN(num)) return str;
  if (str.includes("+")) return str;
  return num;
}

function parseBaths(bathsVal) {
  if (bathsVal === undefined || bathsVal === null) return undefined;
  const str = bathsVal.toString().trim().toLowerCase();
  const num = parseInt(str, 10);
  if (isNaN(num)) return str;
  if (str.includes("+")) return str;
  return num;
}

function parseAmenities(amenitiesVal) {
  if (!amenitiesVal || typeof amenitiesVal !== "string") return [];
  return amenitiesVal
    .split(",")
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

// Function to process scraped listings JSON file and save to MongoDB
async function processScrapedData() {
  const jsonPath = path.join(__dirname, "new_listings.json");
  if (!fs.existsSync(jsonPath)) {
    addLog("⚠️ No temporary JSON output file found. Nothing to import to database.");
    return;
  }

  try {
    addLog("📥 Reading new listings JSON output...");
    const fileData = fs.readFileSync(jsonPath, "utf-8");
    const listings = JSON.parse(fileData);

    if (!Array.isArray(listings) || listings.length === 0) {
      addLog("ℹ️ No new listings were scraped. Database is up to date.");
      return;
    }

    addLog(`🔍 Processing ${listings.length} new listings for database import...`);

    // Fetch existing referenceIds in DB
    const existingRefIds = new Set(
      (await Property.distinct("referenceId")).filter(id => id !== null && id !== undefined && id !== "")
    );

    const preparedRecords = [];
    let duplicates = 0;

    for (const item of listings) {
      const referenceId = item["Property Survey No"] ? item["Property Survey No"].toString().trim() : undefined;

      // Check database duplicates
      if (referenceId && existingRefIds.has(referenceId)) {
        duplicates++;
        continue;
      }

      // Check duplicate in the batch being prepared
      if (referenceId && preparedRecords.some(r => r.referenceId === referenceId)) {
        duplicates++;
        continue;
      }

      const { price, frequency } = cleanPrice(item.Price);
      const area = cleanNumber(item.Area, "sqft");
      const pricePerSqft = item["Price per Sqft"] ? cleanNumber(item["Price per Sqft"]) : undefined;
      const beds = parseBeds(item.Beds);
      const baths = parseBaths(item.Baths);
      const parkingSpaces = item["Parking Spaces"] ? parseInt(item["Parking Spaces"], 10) : undefined;
      const verified = item.Verified === "Yes" || item.Verified === true;
      const purpose = item.Purpose ? item.Purpose.toLowerCase().trim() : "rent";
      const furnishing = item.Furnishing ? item.Furnishing.toLowerCase().trim() : "";
      const listedOn = item["Listed On"] ? new Date(item["Listed On"]) : undefined;
      const amenitiesList = parseAmenities(item.Amenities);

      if (!item.Title || !item.Purpose || !item["Property Type"] || isNaN(price) || isNaN(area)) {
        addLog(`⚠️ Validation failed for listing: "${item.Title || "N/A"}". Skipping.`);
        continue;
      }

      preparedRecords.push({
        title: item.Title,
        description: item.Description || "",
        exclusive: false,
        verified: verified,
        location: item.Location || "",
        city: item.City || "",
        city_area: item["City Area"] || "",
        country: "UAE",
        price: price,
        price_frequency: frequency,
        price_per_sqft: isNaN(pricePerSqft) ? undefined : pricePerSqft,
        purpose: purpose,
        property_type: item["Property Type"],
        furnishing: furnishing,
        baths: baths,
        beds: beds,
        parking_spaces: isNaN(parkingSpaces) ? undefined : parkingSpaces,
        img_links: item.Image_URL && item.Image_URL !== "N/A" ? [item.Image_URL] : [],
        area: area,
        listed_on: listedOn,
        propertySurveyNo: referenceId,
        permitNumber: referenceId,
        referenceId: referenceId,
        agentName: item["Agent Name"] || "N/A",
        agentPhone: item["Agent Phone"] || "N/A",
        agentWhatsApp: item["Agent WhatsApp"] || "N/A",
        link: item.Link,
        status: "active",
        amenities: amenitiesList
      });
    }

    addLog(`📊 Duplicate Check: Skipped ${duplicates} duplicates.`);
    if (preparedRecords.length > 0) {
      addLog(`💾 Inserting ${preparedRecords.length} unique new listings into database...`);
      await Property.insertMany(preparedRecords);
      addLog(`🎉 Database successfully updated with ${preparedRecords.length} properties.`);
    } else {
      addLog("ℹ️ No new unique listings to insert into the database.");
    }

    // Clean up temporary file
    fs.unlinkSync(jsonPath);
  } catch (err) {
    addLog(`❌ Error importing listings to database: ${err.message}`);
  }
}

// Core function to spawn scraper child process
function runScraper(pagesDepth) {
  if (isScraping) {
    addLog("⚠️ Scraper is already running!");
    return;
  }

  isScraping = true;
  const targetPages = pagesDepth || config.pages || 3;
  addLog(`🚀 Starting scraper run (depth: ${targetPages} pages)...`);

  const scraperScript = path.join(__dirname, "scraper_pf.py");
  const tempJson = path.join(__dirname, "new_listings.json");

  const pythonCmd = process.platform === "win32" ? "python" : "python3";
  // Launch python script
  currentProcess = spawn(pythonCmd, [
    scraperScript,
    "--pages", targetPages.toString(),
    "--output", EXCEL_PATH,
    "--new-json", tempJson
  ]);

  // Handle spawn startup error to prevent Node crash and log failure
  currentProcess.on("error", (err) => {
    addLog(`[ERROR] Python scraper process failed to start: ${err.message}`);
    console.error("❌ Python scraper process failed to start:", err);
  });

  currentProcess.stdout.on("data", (data) => {
    const lines = data.toString().split("\n");
    lines.forEach(line => {
      const cleanLine = line.trim();
      if (cleanLine) addLog(cleanLine);
    });
  });

  currentProcess.stderr.on("data", (data) => {
    const lines = data.toString().split("\n");
    lines.forEach(line => {
      const cleanLine = line.trim();
      if (cleanLine) addLog(`[ERROR] ${cleanLine}`);
    });
  });

  currentProcess.on("close", async (code) => {
    addLog(`🏁 Scraper process exited with code ${code}`);
    isScraping = false;
    currentProcess = null;

    if (code === 0) {
      await processScrapedData();
      addLog("✅ Scraping job successfully finished and spreadsheet/database updated.");
    } else {
      addLog("❌ Scraper execution failed or was aborted.");
    }
  });
}

// Autopilot Scheduler Configurator
function scheduleCron() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }

  if (!config.autopilot) {
    addLog("⏹️ Autopilot Mode is disabled. Cron scheduler stopped.");
    return;
  }

  // Parse time "HH:MM"
  const timeParts = config.runTime.split(":");
  if (timeParts.length !== 2) {
    addLog("❌ Invalid time format in config for Autopilot scheduling.");
    return;
  }

  const minute = parseInt(timeParts[1]);
  const hour = parseInt(timeParts[0]);

  if (isNaN(minute) || isNaN(hour)) {
    addLog("❌ Failed to parse hour/minute in Autopilot time config.");
    return;
  }

  // Setup daily cron
  const cronExpr = `${minute} ${hour} * * *`;
  cronJob = cron.schedule(cronExpr, () => {
    addLog(`⏰ Cron Triggered: Autopilot daily run starting.`);
    runScraper(config.pages);
  });

  addLog(`📅 Autopilot Mode is active. Scheduled to run daily at ${config.runTime} (${cronExpr}).`);
}

// Initial scheduling run on startup
scheduleCron();

// ==========================================
// REST API ENDPOINTS
// ==========================================

// Get Scraper Status & Configs
app.get("/api/status", (req, res) => {
  res.json({
    isScraping,
    config
  });
});

// Start Scraping Job manually
app.post("/api/start-scrape", (req, res) => {
  if (isScraping) {
    return res.status(400).json({ error: "Scraper is already active." });
  }
  const pages = req.body.pages ? parseInt(req.body.pages) : config.pages;
  runScraper(pages);
  res.json({ message: "Scraper initiated.", pages });
});

// Stop current active scraping process
app.post("/api/stop-scrape", (req, res) => {
  if (!isScraping || !currentProcess) {
    return res.status(400).json({ error: "No active scraper process to terminate." });
  }

  addLog("⏹️ Terminating active scraper process by user request...");
  currentProcess.kill("SIGINT");
  res.json({ message: "Scraper termination requested." });
});

// Toggle Autopilot settings
app.post("/api/autopilot", (req, res) => {
  const { enabled, time, pages } = req.body;

  if (enabled !== undefined) config.autopilot = !!enabled;
  if (time) config.runTime = time;
  if (pages) config.pages = parseInt(pages) || 3;

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  addLog(`⚙️ Autopilot settings updated: enabled=${config.autopilot}, time=${config.runTime}, pages=${config.pages}`);

  scheduleCron();
  res.json({ message: "Autopilot settings saved successfully.", config });
});

// Fetch historical log buffer
app.get("/api/logs", (req, res) => {
  res.json({ logs: logBuffer });
});

// Server-Sent Events (SSE) stream for live logs
app.get("/api/logs/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const client = { id: Date.now(), res };
  sseClients.push(client);

  // Stream current memory log buffer immediately
  logBuffer.forEach(line => {
    res.write(`data: ${JSON.stringify({ log: line })}\n\n`);
  });

  req.on("close", () => {
    sseClients = sseClients.filter(c => c.id !== client.id);
  });
});

// Fetch properties stats from database
app.get("/api/stats", async (req, res) => {
  try {
    const totalCount = await Property.countDocuments();
    const rentCount = await Property.countDocuments({ purpose: "rent" });
    const saleCount = await Property.countDocuments({ purpose: "sale" });

    // Scraped today logic
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const scrapedToday = await Property.countDocuments({
      createdAt: { $gte: startOfToday }
    });

    // Extract unique cities and count them
    const cities = await Property.distinct("city");

    // Last scrape completion details from scraper.log file modification time
    let lastUpdated = "N/A";
    if (fs.existsSync(EXCEL_PATH)) {
      const stats = fs.statSync(EXCEL_PATH);
      lastUpdated = stats.mtime;
    }

    res.json({
      totalCount,
      rentCount,
      saleCount,
      scrapedToday,
      citiesCount: cities.length,
      lastUpdated
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Paginated Property Browser REST API
app.get("/api/properties", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = (req.query.search || "").toString().trim();
    const purpose = (req.query.purpose || "").toString().trim();
    const city = (req.query.city || "").toString().trim();
    const type = (req.query.type || "").toString().trim();

    const query = {};

    // Ignore placeholder strings like "null" / "undefined" that might be passed from React
    if (search && search !== "undefined" && search !== "null") {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
        { referenceId: { $regex: search, $options: "i" } }
      ];
    }

    if (purpose && purpose !== "undefined" && purpose !== "null" && purpose.toLowerCase() !== "all") {
      // Query case-insensitively using regex to support "rent"/"Rent" and "sale"/"Sale"
      query.purpose = { $regex: `^${purpose}$`, $options: "i" };
    }

    if (city && city !== "undefined" && city !== "null" && city.toLowerCase() !== "all") {
      query.city = { $regex: `^${city}$`, $options: "i" };
    }

    if (type && type !== "undefined" && type !== "null" && type.toLowerCase() !== "all") {
      query.property_type = { $regex: type, $options: "i" };
    }

    // Debugging logs to Railway / server console
    console.log("----------------------------------------");
    console.log("API Properties Request Query Params:", req.query);
    console.log("Mongoose Collection:", Property.collection.collectionName);
    console.log("Database Name:", mongoose.connection.db.databaseName);
    console.log("Constructed MongoDB Query:", JSON.stringify(query));

    const total = await Property.countDocuments(query);
    const properties = await Property.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    console.log("Database Total Matching Documents:", total);
    console.log("Returning properties count in page:", properties.length);
    console.log("----------------------------------------");

    res.json({
      properties,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (err) {
    console.error("❌ Error in GET /api/properties:", err);
    res.status(500).json({ error: err.message });
  }
});

// Download compiled Excel spreadsheet
app.get("/api/download-excel", (req, res) => {
  if (!fs.existsSync(EXCEL_PATH)) {
    return res.status(404).json({ error: "Spreadsheet file does not exist yet. Initiate a scraper run first." });
  }
  res.download(EXCEL_PATH, "propertyfinder_detailed_properties.xlsx");
});

// Catch-all route to print API message
app.get("/", (req, res) => {
  res.send("PropertyFinder Automation API running. Connect React client to see the visual dashboard!");
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Express server backend listening on http://localhost:${PORT}`);
});
