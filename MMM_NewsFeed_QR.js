Module.register("MMM_NewsFeed_QR", {
	// Default module config
	defaults: {
		feeds: [
			{
				title: "New York Times",
				url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
				encoding: "UTF-8", // ISO-8859-1
			},
		],
		showQRCode: true, // Enable or disable QR codes
		showDescription: false,
		showSourceTitle: true,
		showPublishDate: true,
		reloadInterval: 5 * 60 * 1000, // every 5 minutes
		updateInterval: 10 * 1000,
	},

	// Required scripts
	getScripts() {
		return ["moment.js"];
	},

	// Required styles
	getStyles() {
		return ["MMM_NewsFeed_QR.css"];
	},

	// Start module
	start() {
		Log.info(`Starting module: ${this.name}`);

		this.newsItems = [];
		this.loaded = false;
		this.error = null;

		this.registerFeeds();
	},

	// Handle notifications from node_helper
	socketNotificationReceived(notification, payload) {
		if (notification === "NEWS_ITEMS") {
			this.generateFeed(payload);

			if (!this.loaded) {
				this.loaded = true;
				this.error = null;
				this.updateDom();
			}
		} else if (notification === "QR_CODE_IMAGE") {
			this.appendQRCode(payload.url, payload.imageUrl);
		}
	},

	// Create the DOM structure
	getDom() {
		const wrapper = document.createElement("div");

		if (this.error) {
			wrapper.innerHTML = this.error;
			return wrapper;
		}

		if (this.newsItems.length === 0) {
			wrapper.innerHTML = this.translate("EMPTY");
			return wrapper;
		}

		this.newsItems.forEach((item) => {
			const itemWrapper = document.createElement("div");
			itemWrapper.className = "news-item";

			const title = document.createElement("div");
			title.className = "news-title";
			title.innerHTML = item.title;
			itemWrapper.appendChild(title);

			if (this.config.showQRCode) {
				const qrWrapper = document.createElement("div");
				qrWrapper.className = "news-qr";
				qrWrapper.id = `qr_${btoa(item.url)}`; // Use the URL as an identifier
				qrWrapper.innerHTML = "Generating QR Code...";
				itemWrapper.appendChild(qrWrapper);

				// Request QR code from backend
				this.sendSocketNotification("REQUEST_QR_CODE", item.url);
			}

			wrapper.appendChild(itemWrapper);
		});

		return wrapper;
	},

	appendQRCode(url, imageUrl) {
		const qrWrapper = document.getElementById(`qr_${btoa(url)}`);
		if (qrWrapper) {
			qrWrapper.innerHTML = ""; // Clear any existing content
			const img = document.createElement("img");
			img.src = imageUrl; // Set the backend-generated QR code image
			qrWrapper.appendChild(img);
		}
	},

	registerFeeds() {
		for (let feed of this.config.feeds) {
			this.sendSocketNotification("ADD_FEED", feed);
		}
	},

	generateFeed(feeds) {
		this.newsItems = feeds;
	},
});
