// Global variables for recording
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let recordedAudioBase64 = null;
let recordedAudioMimeType = null;
let currentAudioStream = null;
let actualMimeTypeFromRecorder = "";

// Global variables for image
let recordedImageDataUrlBase64 = null;
let recordedImageMimeType = null;

// --- NEW: Global variables for form selection ---
let manuallySelectedFormId = null;
let isFormSelectionModePopupActive = false; // Tracks if popup initiated selection mode

document.addEventListener("DOMContentLoaded", () => {
	// --- DOM Elements ---
	const recordButton = document.getElementById("recordButton");
	const recordButtonText = recordButton.querySelector("span");
	const recordingStatusDiv = document.getElementById("recordingStatus");
	const userRequestTextarea = document.getElementById("userRequest");
	const processFormsButton = document.getElementById("processForms");
	const processFormsButtonText = processFormsButton.querySelector(".button-text");
	const processFormsButtonSpinner = processFormsButton.querySelector(".spinner");
	const geminiOutputDiv = document.getElementById("geminiOutput");
	const formsFoundDiv = document.getElementById("formsFound");
	const imageUploadInput = document.getElementById("imageUpload");
	const imageStatusDiv = document.getElementById("imageStatus");
	const imagePreviewContainer = document.getElementById("imagePreviewContainer");
	const clearImageButton = document.getElementById("clearImageButton");
	const resultsLoaderOverlay = document.querySelector(".results-loader-overlay");
	const resultsContent = document.querySelector(".results-content");

	// --- NEW: Form Selection DOM Elements ---
	const selectFormButton = document.getElementById("selectFormButton");
	const selectFormButtonText = selectFormButton.querySelector("span"); // Re-get for this button
	const selectedFormDisplay = document.getElementById("selectedFormDisplay");

	// --- Initial UI Setup ---
	clearImagePreviewDOM();
	clearAudioPlayer();
	updateSelectedFormDisplay(); // Initial display for selected form

	// --- Event Listeners ---
	recordButton.addEventListener("click", toggleRecording);
	imageUploadInput.addEventListener("change", handleImageUpload);
	clearImageButton.addEventListener("click", clearImage);
	processFormsButton.addEventListener("click", handleProcessForms);
	selectFormButton.addEventListener("click", toggleFormSelectionMode); // NEW

	// --- Status Message Helper ---
	function showStatusMessage(element, message, type = "info") {
		element.textContent = message;
		element.className = `status-message ${type} visible`;
		if (type === "recording" && message.toLowerCase().includes("recording")) {
			element.innerHTML = `<span class="pulsing-dot"></span> ${message}`;
		}
	}
	function clearStatusMessage(element) {
		element.textContent = "";
		element.className = "status-message";
	}

	// --- NEW: Form Selection Logic ---
	function updateSelectedFormDisplay() {
		if (isFormSelectionModePopupActive) {
			selectedFormDisplay.textContent = "Click element on page...";
			selectedFormDisplay.className = "status-like-display selecting";
		} else if (manuallySelectedFormId) {
			selectedFormDisplay.textContent = `Selected: ${manuallySelectedFormId}`;
			selectedFormDisplay.className = "status-like-display selected";
		} else {
			selectedFormDisplay.textContent = "No form selected.";
			selectedFormDisplay.className = "status-like-display";
		}
	}

	function getActiveTabId(callback) {
		chrome.windows.getLastFocused({ populate: true, windowTypes: ["normal", "panel"] }, (lastFocusedWindow) => {
			if (chrome.runtime.lastError || !lastFocusedWindow) {
				console.error("POPUP: Error getting last focused window:", chrome.runtime.lastError?.message);
				callback(null);
				return;
			}
			const targetTab = lastFocusedWindow.tabs.find((t) => t.active);
			if (!targetTab || !targetTab.id) {
				console.error("POPUP: Could not find an active tab.");
				callback(null);
				return;
			}
			if (
				targetTab.url &&
				(targetTab.url.startsWith("chrome://") || targetTab.url.startsWith("edge://") || targetTab.url.startsWith(chrome.runtime.getURL("")))
			) {
				handleErrorInUI("Cannot interact with this type of page. Please select a regular web page.", "Action not allowed.");
				callback(null);
				return;
			}
			callback(targetTab.id);
		});
	}

	function toggleFormSelectionMode() {
		if (isFormSelectionModePopupActive) {
			// Already active, user wants to cancel from popup
			getActiveTabId((tabId) => {
				if (tabId) {
					chrome.tabs.sendMessage(tabId, { action: "cancelFormSelectionMode" }, (response) => {
						if (chrome.runtime.lastError) console.warn("POPUP: Error sending cancelFormSelectionMode:", chrome.runtime.lastError.message);
						// UI update will happen via message from content script or forced if no response
						exitFormSelectionModeUI("Cancelled from popup.");
					});
				} else {
					exitFormSelectionModeUI("No active tab to cancel on.");
				}
			});
		} else {
			// User wants to start selection
			getActiveTabId((tabId) => {
				if (!tabId) {
					handleErrorInUI("Cannot start form selection: No active tab found.", "Error: No active tab.");
					return;
				}
				// Ensure content script is there (it should be, but good check)
				chrome.scripting.executeScript({ target: { tabId: tabId }, files: ["content.js"] }, (injectionResults) => {
					if (chrome.runtime.lastError) {
						handleErrorInUI(
							`Error preparing page for selection: ${chrome.runtime.lastError.message}.`,
							"Error: Script injection failed."
						);
						return;
					}
					// Always extract/tag forms first to ensure data-ai-form-id attributes are present
					chrome.tabs.sendMessage(tabId, { action: "extractForms" }, (formsDataResponse) => {
						if (chrome.runtime.lastError) {
							handleErrorInUI(
								`Failed to prepare forms on page: ${chrome.runtime.lastError.message}. Try refreshing.`,
								"Error: Page form preparation failed."
							);
							return;
						}
						if (!formsDataResponse) {
							// Should not happen if content script responds
							handleErrorInUI(`No response from page during form preparation.`, "Error: Page unresponsive.");
							return;
						}
						// Now tell content script to start selection mode
						chrome.tabs.sendMessage(tabId, { action: "startFormSelectionMode" }, (response) => {
							if (chrome.runtime.lastError) {
								handleErrorInUI("Failed to activate form selection on page.", `Error: ${chrome.runtime.lastError.message}`);
								return;
							}
							if (response && response.status === "listening") {
								enterFormSelectionModeUI();
							} else {
								handleErrorInUI("Page did not confirm form selection mode.", "Error: Page did not respond as expected.");
							}
						});
					});
				});
			});
		}
	}

	function enterFormSelectionModeUI() {
		isFormSelectionModePopupActive = true;
		document.body.classList.add("selecting-form"); // For CSS hooks on popup body
		selectFormButtonText.textContent = "Cancel Selection";
		updateSelectedFormDisplay();
		// Optional: Minimize popup. chrome.windows.update(chrome.windows.WINDOW_ID_CURRENT, { state: "minimized" });
		// This can be jarring, so user education would be needed. For now, rely on visual cues.
	}

	function exitFormSelectionModeUI(reason = "") {
		isFormSelectionModePopupActive = false;
		document.body.classList.remove("selecting-form");
		selectFormButtonText.textContent = "Select Form on Page";
		if (reason) {
			// If a reason like cancellation is given, update display accordingly for a moment
			if (!manuallySelectedFormId) selectedFormDisplay.textContent = reason;
		}
		updateSelectedFormDisplay();
	}

	// Listen for messages from content script regarding form selection
	chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
		if (request.action === "formSelectedByContentScript") {
			manuallySelectedFormId = request.formId; // Can be null if selection failed on page
			exitFormSelectionModeUI(request.formId ? "" : "Selection failed on page.");
			sendResponse({ status: "Popup acknowledged form selection" });
		} else if (request.action === "formSelectionCancelledByContentScript") {
			manuallySelectedFormId = null; // Ensure it's cleared
			exitFormSelectionModeUI("Selection cancelled on page.");
			sendResponse({ status: "Popup acknowledged cancellation" });
		}
		return true; // Keep channel open for other listeners if any (though typically not needed here)
	});

	// --- Image Handling ---
	function handleImageUpload(event) {
		const file = event.target.files[0];
		if (!file) {
			clearStatusMessage(imageStatusDiv);
			return;
		}
		const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
		if (!allowedTypes.includes(file.type)) {
			showStatusMessage(imageStatusDiv, "Error: Invalid file type. Use PNG, JPEG, or WEBP.", "error");
			imageUploadInput.value = "";
			return;
		}
		showStatusMessage(imageStatusDiv, "Processing image...", "info");
		imagePreviewContainer.classList.remove("has-image");
		compressAndStoreImage(file);
	}

	async function compressAndStoreImage(file) {
		clearImageButton.style.display = "none";
		clearImagePreviewDOM();
		recordedImageDataUrlBase64 = null;
		recordedImageMimeType = null;
		try {
			const reader = new FileReader();
			reader.onload = (e_reader) => {
				try {
					const img = new Image();
					img.onload = () => {
						try {
							const MAX_DIMENSION = 1536;
							let canvas = document.createElement("canvas");
							let ctx = canvas.getContext("2d");
							let width = img.width;
							let height = img.height;

							if (width === 0 || height === 0) {
								showStatusMessage(imageStatusDiv, "Error: Image has invalid dimensions (0x0).", "error");
								imageUploadInput.value = "";
								return;
							}
							if (width > height) {
								if (width > MAX_DIMENSION) {
									height = Math.round((height * MAX_DIMENSION) / width);
									width = MAX_DIMENSION;
								}
							} else {
								if (height > MAX_DIMENSION) {
									width = Math.round((width * MAX_DIMENSION) / height);
									height = MAX_DIMENSION;
								}
							}
							if (width <= 0 || height <= 0) {
								showStatusMessage(imageStatusDiv, "Error: Image resizing resulted in invalid dimensions.", "error");
								imageUploadInput.value = "";
								return;
							}
							canvas.width = width;
							canvas.height = height;
							ctx.drawImage(img, 0, 0, width, height);
							const outputMimeType = "image/jpeg";
							const dataUrl = canvas.toDataURL(outputMimeType, 0.8);

							if (!dataUrl || dataUrl === "data:," || dataUrl.length < 100) {
								showStatusMessage(imageStatusDiv, "Error: Could not convert image.", "error");
								imageUploadInput.value = "";
								return;
							}
							const parts = dataUrl.split(",");
							if (parts.length < 2 || !parts[1]) {
								showStatusMessage(imageStatusDiv, "Error: Failed to process image data.", "error");
								imageUploadInput.value = "";
								return;
							}
							const base64Data = parts[1];
							const approxSizeBytes = base64Data.length * 0.75;
							const approxSizeMB = approxSizeBytes / (1024 * 1024);
							const MAX_BASE64_SIZE_BYTES = 4 * 1024 * 1024 * 0.95;

							if (approxSizeBytes > MAX_BASE64_SIZE_BYTES) {
								showStatusMessage(imageStatusDiv, `Error: Image too large (${approxSizeMB.toFixed(1)}MB). Max ~3.8MB.`, "error");
								imageUploadInput.value = "";
								return;
							}
							recordedImageDataUrlBase64 = base64Data;
							recordedImageMimeType = outputMimeType;
							displayImagePreviewDOM(dataUrl);
							showStatusMessage(imageStatusDiv, `Image ready (${approxSizeMB.toFixed(2)}MB).`, "success");
							clearImageButton.style.display = "flex";
							imagePreviewContainer.classList.add("has-image");
						} catch (imgLoadError) {
							showStatusMessage(imageStatusDiv, "Error: Failed during image processing.", "error");
							imageUploadInput.value = "";
							console.error("POPUP ImgLoadError:", imgLoadError);
						}
					};
					img.onerror = () => {
						showStatusMessage(imageStatusDiv, "Error: Could not load image file.", "error");
						imageUploadInput.value = "";
						console.error("POPUP Img.onerror");
					};
					if (e_reader.target && typeof e_reader.target.result === "string") {
						img.src = e_reader.target.result;
					} else {
						showStatusMessage(imageStatusDiv, "Error: FileReader invalid result.", "error");
						imageUploadInput.value = "";
						console.error("POPUP FileReader invalid result");
					}
				} catch (readerLoadError) {
					showStatusMessage(imageStatusDiv, "Error: Failed after reading image file.", "error");
					imageUploadInput.value = "";
					console.error("POPUP ReaderLoadError:", readerLoadError);
				}
			};
			reader.onerror = (e_reader_error) => {
				showStatusMessage(imageStatusDiv, "Error reading the selected file.", "error");
				imageUploadInput.value = "";
				console.error("POPUP Reader.onerror", e_reader_error);
			};
			reader.readAsDataURL(file);
		} catch (outerError) {
			showStatusMessage(imageStatusDiv, "Error: Issue initiating image processing.", "error");
			imageUploadInput.value = "";
			console.error("POPUP OuterError compress:", outerError);
		}
	}

	function displayImagePreviewDOM(dataUrl) {
		clearImagePreviewDOM();
		const imgElement = document.createElement("img");
		imgElement.src = dataUrl;
		imagePreviewContainer.appendChild(imgElement);
		imagePreviewContainer.classList.add("has-image");
	}

	function clearImagePreviewDOM() {
		imagePreviewContainer.innerHTML = "";
		imagePreviewContainer.classList.remove("has-image");
	}

	function clearImage() {
		recordedImageDataUrlBase64 = null;
		recordedImageMimeType = null;
		imageUploadInput.value = "";
		clearImagePreviewDOM();
		clearStatusMessage(imageStatusDiv);
		clearImageButton.style.display = "none";
	}

	// --- Audio Handling ---
	async function toggleRecording() {
		if (!isRecording) {
			try {
				currentAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
				const preferredMimeTypes = ["audio/ogg; codecs=opus", "audio/mp3", "audio/wav", "audio/webm; codecs=opus", "audio/webm"];
				let options = {};
				for (const mimeType of preferredMimeTypes) {
					if (MediaRecorder.isTypeSupported(mimeType)) {
						options.mimeType = mimeType;
						break;
					}
				}
				mediaRecorder = new MediaRecorder(currentAudioStream, options);
				actualMimeTypeFromRecorder = mediaRecorder.mimeType || "";

				mediaRecorder.onstart = () => {
					recordButtonText.textContent = "Stop Recording";
					recordButton.classList.add("is-recording");
					showStatusMessage(recordingStatusDiv, "Recording...", "recording");
					isRecording = true;
					audioChunks = [];
					recordedAudioBase64 = null;
					recordedAudioMimeType = null;
					clearAudioPlayer();
				};
				mediaRecorder.ondataavailable = (event) => {
					if (event.data.size > 0) audioChunks.push(event.data);
				};
				mediaRecorder.onstop = () => {
					recordButtonText.textContent = "Start Recording";
					recordButton.classList.remove("is-recording");
					isRecording = false;
					if (currentAudioStream) currentAudioStream.getTracks().forEach((track) => track.stop());
					if (audioChunks.length === 0) {
						showStatusMessage(recordingStatusDiv, "No audio data captured.", "error");
						clearAudioPlayer();
						return;
					}
					let blobCreationMimeType = actualMimeTypeFromRecorder || "audio/webm";
					const audioBlob = new Blob(audioChunks, { type: blobCreationMimeType });
					audioChunks = [];
					if (audioBlob.size === 0) {
						showStatusMessage(recordingStatusDiv, "No audio recorded (empty blob).", "error");
						clearAudioPlayer();
						return;
					}
					recordedAudioMimeType = audioBlob.type || blobCreationMimeType;
					const baseMimeType = recordedAudioMimeType.split(";")[0];
					const supportedGeminiBaseTypes = ["audio/wav", "audio/mp3", "audio/aiff", "audio/aac", "audio/ogg", "audio/flac"];
					if (!supportedGeminiBaseTypes.includes(baseMimeType) && baseMimeType === "audio/webm") {
						recordedAudioMimeType = "audio/ogg";
					} else if (!supportedGeminiBaseTypes.includes(baseMimeType)) {
						showStatusMessage(
							recordingStatusDiv,
							`Audio type ${baseMimeType} might not be optimal. Trying as ${recordedAudioMimeType}.`,
							"info"
						);
					}
					showStatusMessage(recordingStatusDiv, "Processing audio...", "info");
					createAudioPlayer(audioBlob);
					const reader = new FileReader();
					reader.onloadend = () => {
						const result = reader.result;
						if (typeof result === "string") {
							const parts = result.split(",");
							if (parts.length > 1 && parts[1]) {
								recordedAudioBase64 = parts[1];
								showStatusMessage(recordingStatusDiv, `Audio ready! (Type: ${recordedAudioMimeType.split(";")[0]})`, "success");
							} else {
								showStatusMessage(recordingStatusDiv, "Error processing audio data (Base64).", "error");
								clearAudioPlayer();
							}
						} else {
							showStatusMessage(recordingStatusDiv, "Error: FileReader did not return string.", "error");
							clearAudioPlayer();
						}
					};
					reader.onerror = () => {
						showStatusMessage(recordingStatusDiv, "Error reading audio file.", "error");
						clearAudioPlayer();
					};
					reader.readAsDataURL(audioBlob);
				};
				mediaRecorder.start();
			} catch (err) {
				showStatusMessage(recordingStatusDiv, `Mic error: ${err.name || err.message}`, "error");
				if (currentAudioStream) currentAudioStream.getTracks().forEach((track) => track.stop());
				console.error("POPUP Mic Error:", err);
				recordButtonText.textContent = "Start Recording";
				recordButton.classList.remove("is-recording");
				isRecording = false;
			}
		} else {
			if (mediaRecorder && mediaRecorder.state === "recording") {
				mediaRecorder.stop();
			} else {
				recordButtonText.textContent = "Start Recording";
				recordButton.classList.remove("is-recording");
				isRecording = false;
				if (currentAudioStream) currentAudioStream.getTracks().forEach((track) => track.stop());
				showStatusMessage(recordingStatusDiv, "Stopped.", "info");
			}
		}
	}

	function createAudioPlayer(audioBlob) {
		clearAudioPlayer();
		if (audioBlob && audioBlob.size > 0) {
			const audioUrl = URL.createObjectURL(audioBlob);
			const audioElement = document.createElement("audio");
			audioElement.controls = true;
			audioElement.src = audioUrl;
			document.getElementById("audioPlayerContainer").appendChild(audioElement);
		}
	}

	function clearAudioPlayer() {
		const playerContainer = document.getElementById("audioPlayerContainer");
		const existingAudio = playerContainer.querySelector("audio");
		if (existingAudio && existingAudio.src && existingAudio.src.startsWith("blob:")) {
			URL.revokeObjectURL(existingAudio.src);
		}
		playerContainer.innerHTML = "";
	}

	// --- Main Processing Logic ---
	function setProcessingState(isProcessing) {
		processFormsButton.disabled = isProcessing;
		processFormsButton.classList.toggle("is-loading", isProcessing);
		processFormsButtonText.textContent = isProcessing ? "Processing..." : "Process with AI";
		processFormsButtonSpinner.style.display = isProcessing ? "inline-block" : "none";
		if (isProcessing) {
			resultsLoaderOverlay.classList.add("visible");
			resultsContent.classList.add("loading");
		} else {
			resultsLoaderOverlay.classList.remove("visible");
			resultsContent.classList.remove("loading");
		}
	}

	function handleProcessForms() {
		const userRequest = userRequestTextarea.value.trim();
		formsFoundDiv.innerHTML = "";
		geminiOutputDiv.textContent = "";
		geminiOutputDiv.className = "";

		let processingMessageParts = [];
		if (manuallySelectedFormId) processingMessageParts.push(`selected form (${manuallySelectedFormId})`);
		if (recordedImageDataUrlBase64) processingMessageParts.push("image");
		if (recordedAudioBase64) processingMessageParts.push("audio");
		if (userRequest !== "") processingMessageParts.push("text");

		if (processingMessageParts.length === 0 && !manuallySelectedFormId) {
			// Need at least one input if no form selected
			handleErrorInUI("Please provide input (type, record audio, upload image, or select a form).", "No input provided.");
			return;
		}
		if (processingMessageParts.length === 0 && manuallySelectedFormId && !userRequest && !recordedAudioBase64 && !recordedImageDataUrlBase64) {
			// User selected a form but provided no other input to fill it with
			handleErrorInUI("Form selected, but no text, audio, or image provided to fill it.", "Input missing for selected form.");
			return;
		}

		setProcessingState(true);
		geminiOutputDiv.textContent = `Preparing to process with ${processingMessageParts.join(", ")}...`;
		geminiOutputDiv.className = "info-message";

		getActiveTabId((tabId) => {
			if (!tabId) {
				setProcessingState(false);
				// handleErrorInUI already called by getActiveTabId if page is invalid
				return;
			}

			chrome.scripting.executeScript({ target: { tabId: tabId }, files: ["content.js"] }, (injectionResults) => {
				if (chrome.runtime.lastError) {
					let injectionErrorMsg = `Error injecting script: ${chrome.runtime.lastError.message}.`;
					if (
						chrome.runtime.lastError.message.includes("Cannot access contents") ||
						chrome.runtime.lastError.message.includes("No host permissions")
					) {
						injectionErrorMsg += " Check host permissions for this site.";
					}
					handleErrorInUI(injectionErrorMsg, "Error: Script injection failed.");
					setProcessingState(false);
					return;
				}

				chrome.tabs.sendMessage(tabId, { action: "extractForms" }, (formsDataResponse) => {
					if (chrome.runtime.lastError) {
						handleErrorInUI(
							`Error getting forms: ${chrome.runtime.lastError.message}. Try refreshing page.`,
							"Error: No response from page."
						);
						setProcessingState(false);
						return;
					}
					const formsData = formsDataResponse || [];
					displayFormsFound(formsData);

					const messageToBackground = {
						action: "processWithGemini",
						formsData: formsData,
						userRequest: userRequest,
						selectedFormId: manuallySelectedFormId, // Pass the selected form ID
					};
					if (recordedAudioBase64 && recordedAudioMimeType) {
						messageToBackground.audioData = recordedAudioBase64;
						messageToBackground.audioMimeType = recordedAudioMimeType;
					}
					if (recordedImageDataUrlBase64 && recordedImageMimeType) {
						messageToBackground.imageData = recordedImageDataUrlBase64;
						messageToBackground.imageMimeType = recordedImageMimeType;
					}

					geminiOutputDiv.textContent = "Sending to AI...";
					geminiOutputDiv.className = "info-message";

					chrome.runtime.sendMessage(messageToBackground, (response) => {
						setProcessingState(false);
						if (chrome.runtime.lastError) {
							handleErrorInUI("Error communicating with AI service.", `AI Comms Error: ${chrome.runtime.lastError.message}`);
							return;
						}
						displayGeminiOutputAndFillForm(response, tabId);
					});
				});
			});
		});
	}

	function displayFormsFound(formsDataArray) {
		formsFoundDiv.innerHTML = "";
		if (!formsDataArray || formsDataArray.length === 0) {
			formsFoundDiv.innerHTML = '<p class="no-forms">No forms found on this page.</p>';
			return;
		}
		formsDataArray.forEach((form, formIndex) => {
			const formSection = document.createElement("div");
			formSection.className = "form-section";
			let title = `Form ${formIndex + 1} (ID: ${form.uniqueId})`;
			if (form.uniqueId === manuallySelectedFormId) {
				title += ` <strong style="color:var(--success-color);">(USER SELECTED)</strong>`;
			}
			formSection.innerHTML = `<h2>${title}</h2>`;
			if (form.fields.length > 0) {
				const ul = document.createElement("ul");
				form.fields.forEach((field) => {
					const li = document.createElement("li");
					li.textContent = `Name: "${field.name || "N/A"}", Type: "${field.type || "N/A"}"`;
					ul.appendChild(li);
				});
				formSection.appendChild(ul);
			} else {
				const p = document.createElement("p");
				p.textContent = "No fields detected in this form.";
				p.style.fontSize = "0.8em";
				p.style.fontStyle = "italic";
				formSection.appendChild(p);
			}
			formsFoundDiv.appendChild(formSection);
		});
	}

	function displayGeminiOutputAndFillForm(response, tabId) {
		let fillStatusElement = document.getElementById("fillOperationStatus");
		if (fillStatusElement) fillStatusElement.remove(); // Clear previous status

		fillStatusElement = document.createElement("p");
		fillStatusElement.id = "fillOperationStatus";
		fillStatusElement.style.fontSize = "0.8em";
		fillStatusElement.style.marginTop = "5px";

		if (response && response.error) {
			geminiOutputDiv.textContent = "AI Error: " + response.error;
			geminiOutputDiv.className = "error-message";
		} else if (response && response.geminiResult) {
			try {
				const aiResultObject = JSON.parse(response.geminiResult);
				geminiOutputDiv.textContent = JSON.stringify(aiResultObject, null, 2);
				geminiOutputDiv.className = "";

				if (aiResultObject && aiResultObject.formId && Array.isArray(aiResultObject.fieldsToFill)) {
					if (manuallySelectedFormId && aiResultObject.formId !== manuallySelectedFormId) {
						fillStatusElement.textContent = `(AI targeted ${aiResultObject.formId}, but user selected ${manuallySelectedFormId}. Filling user's choice if AI provided fields for it, or AI's choice if fields are for that.)`;
						fillStatusElement.style.color = "var(--warning-color)";
						// Decide which formId to use for filling. Prioritize user's selection if AI response matches it,
						// otherwise, could use AI's choice if it seems more relevant based on fields.
						// For simplicity now, if user selected one, we *expect* AI to use it.
						// If AI ignored it, it's a prompt engineering issue or AI limitation.
						// We'll proceed with filling based on aiResultObject.formId.
					}

					if (aiResultObject.fieldsToFill.length > 0) {
						chrome.tabs.sendMessage(tabId, { action: "fillForm", data: aiResultObject }, (fillResponse) => {
							if (chrome.runtime.lastError) {
								console.error("POPUP: Error fillForm msg:", chrome.runtime.lastError.message);
								fillStatusElement.textContent = `(Fill attempt sent for ${
									aiResultObject.formId
								}, error: ${chrome.runtime.lastError.message.substring(0, 50)}...)`;
								fillStatusElement.style.color = "var(--error-color)";
							} else {
								console.log("POPUP: Form fill response:", fillResponse);
								if (fillResponse && fillResponse.status === "success") {
									fillStatusElement.textContent = `(Successfully filled ${fillResponse.fieldsFilled} field(s) on form ${aiResultObject.formId}.)`;
									fillStatusElement.style.color = "var(--success-color)";
								} else {
									fillStatusElement.textContent = `(Form fill attempt sent for ${aiResultObject.formId}. Page response: ${
										fillResponse ? fillResponse.message : "unknown"
									})`;
									fillStatusElement.style.color = "var(--warning-color)";
								}
							}
							geminiOutputDiv.insertAdjacentElement("afterend", fillStatusElement);
							setTimeout(() => fillStatusElement.remove(), 7000);
						});
					} else {
						fillStatusElement.textContent = `(AI suggested no fields to fill for form ${aiResultObject.formId})`;
						fillStatusElement.style.color = "var(--info-color)";
						geminiOutputDiv.insertAdjacentElement("afterend", fillStatusElement);
						setTimeout(() => fillStatusElement.remove(), 7000);
					}
				} else {
					fillStatusElement.textContent = "(AI response structure not as expected for filling)";
					fillStatusElement.style.color = "var(--error-color)";
					geminiOutputDiv.insertAdjacentElement("afterend", fillStatusElement);
					setTimeout(() => fillStatusElement.remove(), 7000);
				}
			} catch (e) {
				geminiOutputDiv.textContent = "AI returned invalid JSON:\n" + response.geminiResult;
				geminiOutputDiv.className = "error-message";
				console.error("POPUP Parse Gemini JSON Error:", e);
			}
		} else {
			geminiOutputDiv.textContent = "No valid AI output received.";
			geminiOutputDiv.className = "";
		}
	}

	function handleErrorInUI(formsMessage, geminiMessage) {
		console.error("POPUP: handleErrorInUI. Forms Msg:", formsMessage, "Gemini Msg:", geminiMessage);
		if (formsFoundDiv) formsFoundDiv.innerHTML = `<p class="error-message">${formsMessage}</p>`;
		if (geminiOutputDiv) {
			geminiOutputDiv.textContent = geminiMessage;
			geminiOutputDiv.className = "error-message";
		}
		setProcessingState(false);
	}
});
