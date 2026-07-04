const mongoose = require("mongoose");

const propertySchema = new mongoose.Schema(
	{
		title: { type: String, required: true },
		deed: { type: String },
		description: { type: String },
		exclusive: { type: Boolean, default: false },
		verified: { type: Boolean, default: false },
 
		// Location details
		location: { type: String },
		city: { type: String, index: true },
		city_area: { type: String },
		country: { type: String, default: "UAE" },
		unit_number: { type: String },
		mask_unit_number: { type: Boolean, default: false },
		coordinates: {
			type: { type: String, enum: ["Point"] },
			coordinates: [Number], // [longitude, latitude]
		},
 
		// Price details
		price: { type: Number, required: true, index: true },
		price_per_sqft: { type: Number, index: true },
		price_frequency: {
			type: String,
			enum: ["monthly", "yearly", "weekly", "daily", " ", ""],
		},
		service_charge: { type: Number },
		annualCommunity: { type: Number },
		occupancyFee: { type: Number },
		buyerTransferFee: { type: Number },
		totalClosingFee: { type: Number },
		maintenanceFee: { type: Number },
 
		// Property status
		status: {
			type: String,
			enum: ["active", "inactive", "rejected", "deleted", "draft"],
			default: "inactive",
			index: true,
		},
		rejection_message: { type: String },
		isDeleted: { type: Boolean, default: false, index: true },
 
		// Property characteristics
		purpose: {
			type: String,
			enum: ["sell", "rent", "buy", "sale"],
			required: true,
			index: true,
		},
		property_type: { type: String, required: true, index: true },
		furnishing: {
			type: String,
			enum: ["furnished", "semi furnished", "unfurnished", "partially furnished", "partly", "partially", "n/a", ""],
		},
 
		// Property features
		baths: { type: mongoose.Schema.Types.Mixed, index: true }, // Mixed to allow "7+" and number types
		beds: {
			type: mongoose.Schema.Types.Mixed,
			validate: {
				validator: function (v) {
					return typeof v === "number" || typeof v === "string"; // Adjusted to support "7+" and "studio" strings
				},
				message: (props) => `${props.value} is not a valid bed type!`,
			},
			index: true,
		},
		parking_spaces: { type: Number },
 
		// Media
		img_links: [String],
		video_link: String,
 
		// Area details
		area: { type: Number, required: true, index: true },
		built_area: { type: Number },
 
		// Investment metrics
		roi: { type: Number, default: 0, index: true },
		capital_gain: { type: Number, default: 0 },
		rating: { type: Number, default: 0 },
 
		// Deal flags
		hot_deal: { type: Boolean, default: false, index: true },
 
		// Project details
		listed_on: { type: Date, default: Date.now, index: true },
		project_status: {
			type: String,
			enum: ["ready", "off plan", "completed", "under-construction", ""],
			default: "ready",
			index: true,
		},
		handover: {
			type: String,
			default: "",
		},
		developer: {
			type: String,
			default: "",
		},
		paymentPlan: {
			type: String,
			default: "",
		},
 
		// Property registration details
		license_number: { type: String },
		license_type: { type: String },
		listed_by: { type: String },
		readyBy: { type: String },
		landlordName: { type: String },
 
		// References (Amenities as String array per the updated specification)
		amenities: [String],
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: false,
			index: true,
		},
 
		// Agent Details (added matching the Excel sheet columns)
		agentName: { type: String },
		agentPhone: { type: String },
		agentWhatsApp: { type: String },
 
		// Property registration & validation details
		permitNumber: { type: String },
		propertySurveyNo: { type: String },
		DED: { type: String },
		Rera: { type: String },
		referenceId: { type: String, unique: true, sparse: true, index: true }, // For unique duplicate detection
		BRN: { type: String },
 
		// Dubailand Validation URL / Property listing URL
		link: { type: String },
		Dubailand_Validation_URL: { type: String },
		isQRVisible: {
			type: Boolean,
			default: false,
		},
		isQrAvailable: {
			type: Boolean,
		},
 
		// Publishers & Services
		publishers: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: "publisher",
			},
		],
		productServices: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: "Service",
			},
		],
 
		// Lead and payment packages
		leadPlan: {
			type: String,
			enum: ["bulk_lead", "per_lead", ""],
			default: "",
		},
		paymentStatus: {
			type: String,
			enum: ["Pending", "Success", "Failed"],
			default: "Pending",
		},
		leadSubscriptionPaymentStatus: {
			type: String,
			enum: ["Pending", "Success", "Failed"],
			default: "Pending",
		},
		isDealClosed: {
			type: Boolean,
			default: false,
		},
		dealClosingPrice: {
			type: Number,
		},
		dealClosingTime: {
			type: Date,
		},
		dealCommission: {
			type: Number,
		},
		userWhoAcceptedProperty: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
	},
	{
		timestamps: true,
		versionKey: false,
	}
);
 
const Property = mongoose.model("Property", propertySchema, "properties");

module.exports = Property;
