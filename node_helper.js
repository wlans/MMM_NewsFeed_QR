const NodeHelper = require("node_helper");
const Log = require("logger");
const NewsfeedFetcher = require("./newsfeedfetcher");
const QRCode = require("qrcode");

module.exports = NodeHelper.create({
	// Override start method.
	start() {
		Log.log(`Starting node helper for: ${this.name}`);
		this.fetchers = {}; // Initialize fetchers as an object
	},

	// Generate QR code image
	generateQRCode(url) {
		if (!url) {
			Log.error("QR Code generation failed: URL is missing or invalid.");
			return;
		}

		QRCode.toDataURL(url, (err, imageUrl) => {
			if (err) {
				Log.error("Error generating QR Code:", err);
				return;
			}
			this.sendSocketNotification("QR_CODE_IMAGE", { url, imageUrl });
		});
	},

	// Override socketNotificationReceived received.
	socketNotificationReceived(notification, payload) {
		if (!payload) {
			Log.error("Received undefined payload for notification:", notification);
			return;
		}

		if (notification === "ADD_FEED") {
			if (payload.feed && payload.config) {
				this.createFetcher(payload.feed, payload.config);
			} else {
				Log.error("Invalid payload for ADD_FEED:", payload);
			}
		}

		if (notification === "GENERATE_QR_CODE") {
			this.generateQRCode(payload);
		}
	},

	/**
	 * Creates a fetcher for a new feed if it doesn't exist yet.
	 * Otherwise it reuses the existing one.
	 * @param {object} feed The feed object
	 * @param {object} config The configuration object
	 */
	createFetcher(feed, config) {
		if (!feed || !feed.url) {
			Log.error("Feed object is invalid or missing 'url':", feed);
			this.sendSocketNotification("NEWSFEED_ERROR", { error_type: "MODULE_ERROR_INVALID_FEED" });
			return;
		}

		const url = feed.url;
		const encoding = feed.encoding || "UTF-8";
		const reloadInterval = feed.reloadInterval || config.reloadInterval || 5 * 60 * 1000;
		let useCorsProxy = feed.useCorsProxy;
		if (useCorsProxy === undefined) useCorsProxy = true;

		try {
			new URL(url); // Validate URL
		} catch (error) {
			Log.error("Newsfeed Error. Malformed newsfeed URL:", url, error);
			this.sendSocketNotification("NEWSFEED_ERROR", { error_type: "MODULE_ERROR_MALFORMED_URL" });
			return;
		}

		let fetcher;
		if (!this.fetchers[url]) {
			Log.log(`Creating new newsfetcher for URL: ${url} - Interval: ${reloadInterval}`);
			fetcher = new NewsfeedFetcher(url, reloadInterval, encoding, config.logFeedWarnings, useCorsProxy);

			fetcher.onReceive(() => {
				this.broadcastFeeds();
			});

			fetcher.onError((fetcher, error) => {
				Log.error("Newsfeed Error. Could not fetch newsfeed:", url, error);
				const errorType = this.checkFetchError(error);
				this.sendSocketNotification("NEWSFEED_ERROR", { error_type: errorType });
			});

			this.fetchers[url] = fetcher;
		} else {
			Log.log(`Using existing newsfetcher for URL: ${url}`);
			fetcher = this.fetchers[url];
			fetcher.setReloadInterval(reloadInterval);
			fetcher.broadcastItems();
		}

		fetcher.startFetch();
	},

	/**
	 * Creates an object with all feed items of the different registered feeds,
	 * and broadcasts these using sendSocketNotification.
	 */
	broadcastFeeds() {
		const feeds = {};
		for (const url in this.fetchers) {
			feeds[url] = this.fetchers[url].items();
		}
		this.sendSocketNotification("NEWS_ITEMS", feeds);
	},

	/**
	 * Check and return the appropriate error type for fetch errors.
	 * @param {Error} error The error object from the fetcher
	 * @returns {string} Error type
	 */
	checkFetchError(error) {
		if (error.code === "ENOTFOUND") {
			return "MODULE_ERROR_FEED_NOT_FOUND";
		} else if (error.code === "ECONNREFUSED") {
			return "MODULE_ERROR_CONNECTION_REFUSED";
		} else if (error.response && error.response.status >= 400 && error.response.status < 500) {
			return "MODULE_ERROR_CLIENT_ERROR";
		} else if (error.response && error.response.status >= 500) {
			return "MODULE_ERROR_SERVER_ERROR";
		} else {
			return "MODULE_ERROR_UNKNOWN";
		}
	},
});
