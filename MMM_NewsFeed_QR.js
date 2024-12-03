const QRCode = require("qrcode"); // Import the QR code package

Module.register("newsfeed", {
	// Default module config.
	defaults: {
		feeds: [
			{
				title: "New York Times",
				url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
				encoding: "UTF-8" // ISO-8859-1
			}
		],
		showAsList: false,
		showSourceTitle: true,
		showPublishDate: true,
		broadcastNewsFeeds: true,
		broadcastNewsUpdates: true,
		showDescription: false,
		showQRCode: false, // New option to enable or disable QR codes
		showTitleAsUrl: false,
		wrapTitle: true,
		wrapDescription: true,
		truncDescription: true,
		lengthDescription: 400,
		hideLoading: false,
		reloadInterval: 5 * 60 * 1000, // every 5 minutes
		updateInterval: 10 * 1000,
		animationSpeed: 2.5 * 1000,
		maxNewsItems: 0, // 0 for unlimited
		ignoreOldItems: false,
		ignoreOlderThan: 24 * 60 * 60 * 1000, // 1 day
		removeStartTags: "",
		removeEndTags: "",
		startTags: [],
		endTags: [],
		prohibitedWords: [],
		scrollLength: 500,
		logFeedWarnings: false,
		dangerouslyDisableAutoEscaping: false
	},

	// Define required scripts.
	getScripts() {
		return ["moment.js"];
	},

	// Define required styles.
	getStyles() {
		return ["newsfeed.css"];
	},

	// Define start sequence.
	start() {
		Log.info(`Starting module: ${this.name}`);

		// Set locale.
		moment.locale(config.language);

		this.newsItems = [];
		this.loaded = false;
		this.error = null;
		this.activeItem = 0;
		this.scrollPosition = 0;

		this.registerFeeds();
		this.isShowingDescription = this.config.showDescription;
	},

	// Override socket notification handler.
	socketNotificationReceived(notification, payload) {
		if (notification === "NEWS_ITEMS") {
			this.generateFeed(payload);

			if (!this.loaded) {
				if (this.config.hideLoading) {
					this.show();
				}
				this.scheduleUpdateInterval();
			}

			this.loaded = true;
			this.error = null;
		} else if (notification === "NEWSFEED_ERROR") {
			this.error = this.translate(payload.error_type);
			this.scheduleUpdateInterval();
		}
	},

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

			if (this.config.showDescription) {
				const description = document.createElement("div");
				description.className = "news-description";
				description.innerHTML = item.description;
				itemWrapper.appendChild(description);
			}

			// Conditionally generate QR code
			if (this.config.showQRCode) {
				const qrWrapper = document.createElement("div");
				qrWrapper.className = "news-qr";

				const qrCanvas = document.createElement("canvas");
				qrWrapper.appendChild(qrCanvas);

				QRCode.toCanvas(qrCanvas, item.url, {
					width: 100,
					height: 100,
					colorDark: "#000000",
					colorLight: "#ffffff"
				}).catch((err) => {
					Log.error("Error generating QR code:", err);
				});

				itemWrapper.appendChild(qrWrapper);
			}

			wrapper.appendChild(itemWrapper);
		});

		return wrapper;
	},

	// Rest of the unchanged methods
	getActiveItemURL() {
		const item = this.newsItems[this.activeItem];
		if (item) {
			return typeof item.url === "string" ? this.getUrlPrefix(item) + item.url : this.getUrlPrefix(item) + item.url.href;
		} else {
			return "";
		}
	},

	registerFeeds() {
		for (let feed of this.config.feeds) {
			this.sendSocketNotification("ADD_FEED", {
				feed: feed,
				config: this.config
			});
		}
	},

	generateFeed(feeds) {
		let newsItems = [];
		for (let feed in feeds) {
			const feedItems = feeds[feed];
			if (this.subscribedToFeed(feed)) {
				for (let item of feedItems) {
					item.sourceTitle = this.titleForFeed(feed);
					if (!(this.config.ignoreOldItems && Date.now() - new Date(item.pubdate) > this.config.ignoreOlderThan)) {
						newsItems.push(item);
					}
				}
			}
		}
		newsItems.sort((a, b) => new Date(b.pubdate) - new Date(a.pubdate));
		this.newsItems = newsItems;
	},

	scheduleUpdateInterval() {
		this.updateDom(this.config.animationSpeed);

		if (this.timer) clearInterval(this.timer);

		this.timer = setInterval(() => {
			this.activeItem++;
			if (this.activeItem >= this.newsItems.length) {
				this.activeItem = 0;
			}
			this.updateDom(this.config.animationSpeed);
		}, this.config.updateInterval);
	}
});
