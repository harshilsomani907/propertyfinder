/**
 * PropertyFinder Listings Import Script
 * 
 * Description: Connects to MongoDB Atlas, reads property listings from Excel,
 * cleanses numeric/boolean types, performs duplicate checking using referenceId,
 * and saves documents using batched inserts.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const xlsx = require("xlsx");
const path = require("path");
const dns = require("dns");

// Configure public DNS to resolve Atlas SRV addresses correctly on Windows
dns.setServers(["8.8.8.8"]);

// MongoDB Connection URI (Ensure to keep credentials secure in production)
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/propertyfinder";
const EXCEL_FILE_PATH = path.join(__dirname, "propertyfinder_detailed_properties.xlsx");

// Import Mongoose model from the requested path
const Property = require("./models/Property");

/**
 * Parses and cleans price strings.
 * Removes "AED", commas, and frequency text (e.g. "/yearly").
 * @param {string|number} priceVal Raw value from cell
 * @returns {object} { price: Number, frequency: String }
 */
function cleanPrice(priceVal) {
  if (!priceVal) return { price: 0, frequency: "" };
  
  const rawStr = priceVal.toString().trim();
  // Strip commas, currency symbols and spaces
  const cleanStr = rawStr.replace(/AED/gi, "").replace(/,/g, "").trim();
  
  // Split at the frequency delimiter (e.g., "/yearly", "/monthly")
  const parts = cleanStr.split("/");
  const numericPrice = parseFloat(parts[0]);
  const freq = parts[1] ? parts[1].toLowerCase().trim() : "";
  
  return {
    price: isNaN(numericPrice) ? 0 : numericPrice,
    frequency: freq
  };
}

/**
 * Parses numeric columns like Area and Price per Sqft safely.
 * @param {string|number} value Raw cell value
 * @param {string} suffixToRemove Suffix string to remove (e.g., "sqft")
 * @returns {number} Clean parsed number
 */
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

/**
 * Normalizes beds value to a number except when it is "studio".
 * @param {string|number} bedsVal Raw beds cell value
 * @returns {number|string} Parsed beds value (number, "studio", or string if "7+")
 */
function parseBeds(bedsVal) {
  if (bedsVal === undefined || bedsVal === null) return undefined;
  
  const str = bedsVal.toString().trim().toLowerCase();
  if (str === "studio") return "studio";
  
  // Parse integer where possible
  const num = parseInt(str, 10);
  if (isNaN(num)) return str; // Keeps strings like "7+" intact
  
  if (str.includes("+")) return str;
  return num;
}

/**
 * Normalizes baths value to a mixed type (number or string).
 * @param {string|number} bathsVal Raw baths cell value
 * @returns {number|string} Parsed baths value
 */
function parseBaths(bathsVal) {
  if (bathsVal === undefined || bathsVal === null) return undefined;
  
  const str = bathsVal.toString().trim().toLowerCase();
  const num = parseInt(str, 10);
  if (isNaN(num)) return str;
  
  if (str.includes("+")) return str;
  return num;
}

/**
 * Splits and cleans amenities into an array of strings.
 * @param {string} amenitiesVal Comma-separated list from cell
 * @returns {string[]} Array of trimmed amenity strings
 */
function parseAmenities(amenitiesVal) {
  if (!amenitiesVal || typeof amenitiesVal !== "string") return [];
  return amenitiesVal
    .split(",")
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

async function runImport() {
  try {
    console.log("Connecting to MongoDB Atlas...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Successfully connected to MongoDB.");

    console.log("Reading Excel sheet (this may take a few seconds)...");
    const workbook = xlsx.readFile(EXCEL_FILE_PATH);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json(worksheet);

    const totalRows = rawData.length;
    console.log(`📊 Spreadsheet read. Total rows found in sheet: ${totalRows}`);

    // Map column ranges to extract cell hyperlinks
    let linkColIdx = -1;
    let imgLinkColIdx = -1;
    const range = xlsx.utils.decode_range(worksheet["!ref"]);
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const colName = xlsx.utils.encode_col(C);
      const headerCell = worksheet[`${colName}1`];
      const headerVal = headerCell ? headerCell.v : "";
      if (headerVal === "Link") linkColIdx = C;
      if (headerVal === "Image Link") imgLinkColIdx = C;
    }

    // --- Duplicate Detection Strategy using referenceId ---
    // 1. Fetch all existing referenceIds from the DB to skip already imported records
    console.log("Initializing duplicate detection. Fetching existing referenceIds...");
    const existingRefIds = new Set(
      (await Property.distinct("referenceId")).filter(id => id !== null && id !== undefined && id !== "")
    );
    console.log(`Found ${existingRefIds.size} referenceIds already present in MongoDB.`);

    // 2. Track unique referenceIds within the sheet itself to handle duplicates in spreadsheet
    const seenInSheet = new Set();

    const preparedRecords = [];
    let dbDuplicatesCount = 0;
    let sheetDuplicatesCount = 0;
    let failedRecordsCount = 0;

    console.log("Cleansing and preparing records...");

    for (let i = 0; i < totalRows; i++) {
      const row = rawData[i];
      const excelRowIdx = i + 2; // Excel is 1-indexed and row 1 is header

      try {
        // Unique referenceId is mapped from "Property Survey No"
        const referenceId = row["Property Survey No"] ? row["Property Survey No"].toString().trim() : undefined;

        // Skip if referenceId exists in database
        if (referenceId && existingRefIds.has(referenceId)) {
          dbDuplicatesCount++;
          continue;
        }

        // Skip if referenceId is a duplicate inside the spreadsheet
        if (referenceId) {
          if (seenInSheet.has(referenceId)) {
            sheetDuplicatesCount++;
            continue;
          }
          seenInSheet.add(referenceId);
        }

        // Extract cell URLs
        let listingUrl = "";
        if (linkColIdx !== -1) {
          const address = `${xlsx.utils.encode_col(linkColIdx)}${excelRowIdx}`;
          const cell = worksheet[address];
          if (cell && cell.l && cell.l.Target) {
            listingUrl = cell.l.Target;
          }
        }

        let imageUrl = "";
        if (imgLinkColIdx !== -1) {
          const address = `${xlsx.utils.encode_col(imgLinkColIdx)}${excelRowIdx}`;
          const cell = worksheet[address];
          if (cell && cell.l && cell.l.Target) {
            imageUrl = cell.l.Target;
          }
        }

        // Clean numeric and enum fields
        const { price, frequency } = cleanPrice(row.Price);
        const area = cleanNumber(row.Area, "sqft");
        const pricePerSqft = row["Price per Sqft"] ? cleanNumber(row["Price per Sqft"]) : undefined;
        const beds = parseBeds(row.Beds);
        const baths = parseBaths(row.Baths);
        const parkingSpaces = row["Parking Spaces"] ? parseInt(row["Parking Spaces"], 10) : undefined;
        
        // Cast verified values to boolean
        const verified = row.Verified === "Yes" || row.Verified === true;
        
        // Map other details safely
        // Normalize purpose and furnishing to match database enums
        const rawPurpose = row.Purpose ? row.Purpose.toLowerCase().trim() : "rent";
        const purpose = rawPurpose === "sale" ? "sell" : rawPurpose;
        
        let furnishing = row.Furnishing ? row.Furnishing.toLowerCase().trim() : "";
        if (furnishing === "partly" || furnishing === "partially") {
          furnishing = "partially furnished";
        } else if (furnishing === "semi") {
          furnishing = "semi furnished";
        }
        
        const listedOn = row["Listed On"] ? new Date(row["Listed On"]) : undefined;
        const amenitiesList = parseAmenities(row.Amenities);

        // Validation check before insertion (Required schema fields validation)
        if (!row.Title) {
          throw new Error("Missing required field: Title");
        }
        if (!row.Purpose) {
          throw new Error("Missing required field: Purpose");
        }
        if (!row["Property Type"]) {
          throw new Error("Missing required field: Property Type");
        }
        if (isNaN(price) || price <= 0) {
          throw new Error(`Invalid or missing price value: ${row.Price}`);
        }
        if (isNaN(area) || area <= 0) {
          throw new Error(`Invalid or missing area value: ${row.Area}`);
        }

        // Prepare document matching Property schema structure
        const doc = {
          title: row.Title,
          description: row.Description || "",
          exclusive: false,
          verified: verified,
          location: row.Location || "",
          city: row.City || "",
          city_area: row["City Area"] || "",
          country: "UAE",
          price: price,
          price_frequency: frequency,
          price_per_sqft: isNaN(pricePerSqft) ? undefined : pricePerSqft,
          purpose: purpose,
          property_type: row["Property Type"],
          furnishing: furnishing,
          baths: baths,
          beds: beds,
          parking_spaces: isNaN(parkingSpaces) ? undefined : parkingSpaces,
          img_links: imageUrl ? [imageUrl] : [],
          area: area,
          listed_on: listedOn,
          propertySurveyNo: referenceId,
          permitNumber: referenceId,
          referenceId: referenceId,
          agentName: row["Agent Name"] || "N/A",
          agentPhone: row["Agent Phone"] || "N/A",
          agentWhatsApp: row["Agent WhatsApp"] || "N/A",
          link: listingUrl,
          status: "active",
          amenities: amenitiesList
        };

        preparedRecords.push(doc);
      } catch (validationError) {
        failedRecordsCount++;
        console.error(`⚠️ Skip row ${excelRowIdx} due to validation error: ${validationError.message}`);
      }
    }

    console.log(`\n--- Preparation Summary ---`);
    console.log(`Total spreadsheet rows:     ${totalRows}`);
    console.log(`Database duplicates skipped: ${dbDuplicatesCount}`);
    console.log(`Sheet duplicates skipped:    ${sheetDuplicatesCount}`);
    console.log(`Failed validation rows:     ${failedRecordsCount}`);
    console.log(`Prepared records for insert: ${preparedRecords.length}`);

    // --- Batched Insertion to Prevent Memory Overflow ---
    let totalInserted = 0;
    const batchSize = 1000;
    
    if (preparedRecords.length > 0) {
      console.log(`\nInserting records in batches of ${batchSize}...`);
      for (let i = 0; i < preparedRecords.length; i += batchSize) {
        const batch = preparedRecords.slice(i, i + batchSize);
        await Property.insertMany(batch);
        totalInserted += batch.length;
        console.log(`Processed batch: ${totalInserted} / ${preparedRecords.length} inserted.`);
      }
    }

    console.log(`\n🎉 IMPORT RUN COMPLETED!`);
    console.log(`Total rows processed:  ${totalRows}`);
    console.log(`Total prepared:        ${preparedRecords.length}`);
    console.log(`Total successfully inserted: ${totalInserted}`);
    console.log(`Total failed:          ${failedRecordsCount}`);
    console.log(`Total duplicates:      ${dbDuplicatesCount + sheetDuplicatesCount}`);

  } catch (error) {
    console.error("❌ Fatal Error during Excel import:", error);
  } finally {
    // Ensure MongoDB connection is closed cleanly
    console.log("Closing MongoDB connection...");
    await mongoose.connection.close();
    console.log("Database connection closed.");
    process.exit(0);
  }
}

// Execute import
runImport();
