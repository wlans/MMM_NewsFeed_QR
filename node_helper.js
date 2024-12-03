const NodeHelper = require("node_helper");
const Log = require("logger");
const NewsfeedFetcher = require("./newsfeedfetcher");
const QRCode = require("qrcode"); // Import QRCode package

module.exports = NodeHelper.create({
	// Override start method.
	start() {
		Log.log(`Starting node helper for: ${this.name}`);
		this.fetchers = [];
	},

	// Override socketNotificationReceived.
	socketNotificationReceived(notification, payload) {
		if (notification === "ADD_FEED") {
			this.createFetcher(payload.feed, payload.config);
		}
	},

	/**
	 * Creates a fetcher for a new feed if it doesn't exist yet.
	 * Otherwise it reuses the existing one.
	 * @param {object} feed The feed object
	 * @param {object} config The configuration object
	 */
	createFetcher(feed, config) {
		const url = feed.url || "";
		const encoding = feed.encoding || "UTF-8";
		const reloadInterval = feed.reloadInterval || config.reloadInterval || 5 * 60 * 1000;
		let useCorsProxy = feed.useCorsProxy;
		if (useCorsProxy === undefined) useCorsProxy = true;

		try {
			new URL(url);
		} catch (error) {
			Log.error("Newsfeed Error. Malformed newsfeed url: ", url, error);
			this.sendSocketNotification("NEWSFEED_ERROR", { error_type: "MODULE_ERROR_MALFORMED_URL" });
			return;
		}

		let fetcher;
		if (typeof this.fetchers[url] === "undefined") {
			Log.log(`Create new newsfetcher for url: ${url} - Interval: ${reloadInterval}`);
			fetcher = new NewsfeedFetcher(url, reloadInterval, encoding, config.logFeedWarnings, useCorsProxy);

			fetcher.onReceive(() => {
				this.broadcastFeedsWithQR(); // Updated to include QR generation
			});

			fetcher.onError((fetcher, error) => {
				Log.error("Newsfeed Error. Could not fetch newsfeed: ", url, error);
				let error_type = NodeHelper.checkFetchError(error);
				this.sendSocketNotification("NEWSFEED_ERROR", {
					error_type
				});
			});

			this.fetchers[url] = fetcher;
		} else {
			Log.log(`Use existing newsfetcher for url: ${url}`);
			fetcher = this.fetchers[url];
			fetcher.setReloadInterval(reloadInterval);
			fetcher.broadcastItems();
		}

		fetcher.startFetch();
	},

	/**
	 * Creates an object with all feed items of the different registered feeds,
	 * generates QR codes for each item, and broadcasts them using sendSocketNotification.
	 */
	async broadcastFeedsWithQR() {
		const feeds = {};

		for (let f in this.fetchers) {
			const items = this.fetchers[f].items();

			// Generate QR codes for each item
			feeds[f] = await Promise.all(
				items.map(async (item) => {
					try {
						item.qrCode = await QRCode.toDataURL(item.url); // Generate QR code as a data URL
					} catch (error) {
						Log.error("QR Code generation error:", error);
						item.qrCode = null; // Add null if QR code generation fails
					}
					return item;
				})
			);
		}

		this.sendSocketNotification("NEWS_ITEMS", feeds);
	}
});
