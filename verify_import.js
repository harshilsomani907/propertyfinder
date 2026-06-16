require("dotenv").config();
const mongoose = require('mongoose');
const dns = require('dns');

// Configure public DNS to resolve Atlas SRV addresses correctly on Windows
dns.setServers(['8.8.8.8']);

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/propertyfinder";

const Property = require('./models/Property');

async function main() {
  try {
    console.log("Connecting to MongoDB to verify import...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB.");

    const propertyCount = await Property.countDocuments();

    console.log(`\n--- Import Database Counts ---`);
    console.log(`Total Properties in DB: ${propertyCount}`);

    console.log(`\n--- Checking a Sample Property Document ---`);
    const sampleProperty = await Property.findOne();
    if (sampleProperty) {
      console.log(JSON.stringify(sampleProperty.toObject(), null, 2));
    } else {
      console.log("❌ No properties found in DB!");
    }

    // Run some validation checks
    console.log(`\n--- Verification Checks ---`);
    const testProp = await Property.findOne({ baths: '7+' });
    if (testProp) {
      console.log(`✅ Verified baths containing mixed value "7+" correctly: ID = ${testProp._id}`);
    } else {
      console.log(`ℹ️ No property with 7+ baths found in DB (which might be normal depending on data, but let's confirm).`);
    }

    const studioProp = await Property.findOne({ beds: 'studio' });
    if (studioProp) {
      console.log(`✅ Verified beds containing mixed value "studio" correctly: ID = ${studioProp._id}`);
    } else {
      console.log(`ℹ️ No property with 'studio' beds found in DB (which might be normal depending on data).`);
    }

    const linkProp = await Property.findOne({ link: { $ne: "" } });
    if (linkProp) {
      console.log(`✅ Verified that listing hyperlink was extracted: "${linkProp.link}"`);
    } else {
      console.log(`❌ No hyperlink listing link found!`);
    }

    const imgProp = await Property.findOne({ img_links: { $not: { $size: 0 } } });
    if (imgProp) {
      console.log(`✅ Verified that image hyperlink was extracted and stored: "${imgProp.img_links[0]}"`);
    } else {
      console.log(`❌ No image hyperlink found!`);
    }

    const verifiedProp = await Property.findOne({ verified: true });
    if (verifiedProp) {
      console.log(`✅ Verified boolean casting for "Verified" field: ID = ${verifiedProp._id}`);
    } else {
      console.log(`❌ No verified property found!`);
    }

    process.exit(0);
  } catch (err) {
    console.error("❌ Verification failed:", err);
    process.exit(1);
  }
}

main();
