// WARNING: Do NOT hardcode your API key in a production extension.
// For demonstration purposes only. Consider using chrome.storage or a backend proxy.
const GEMINI_API_KEY = "AIzaSyCJMNmYIcImonZSmDQ - MdDlRoF_r0u2Tqs"; // <<< YOUR KEY IS PRESERVED

// --- NEW: Listener for action icon click to create a persistent panel ---
function createOrFocusPanel() {
	const popupUrl = chrome.runtime.getURL("popup.html");
	const windowWidth = 440; // A good starting width
	const windowHeight = 750; // A good starting height

	// Check if the panel already exists
	chrome.windows.getAll({ populate: true, windowTypes: ["panel"] }, (windows) => {
		let existingPanel = null;
		for (const window of windows) {
			if (window.tabs && window.tabs.some((t) => t.url === popupUrl)) {
				existingPanel = window;
				break;
			}
		}

		if (existingPanel && existingPanel.id) {
			// If it exists, just focus it
			chrome.windows.update(existingPanel.id, { focused: true });
		} else {
			// If not, create a new one
			chrome.windows.create({
				url: popupUrl,
				type: "panel", // This is the key change for "always on top" behavior
				width: windowWidth,
				height: windowHeight,
				focused: true,
			});
		}
	});
}

chrome.action.onClicked.addListener((tab) => {
	createOrFocusPanel();
});

// --- UNTOUCHED LOGIC: The original message listener is preserved below ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	console.log("BACKGROUND: Received message. Action:", request.action);

	if (request.action === "processWithGemini") {
		console.log("BACKGROUND: processWithGemini request received. Details:", {
			hasFormsData: !!request.formsData,
			userRequestLength: request.userRequest ? request.userRequest.length : 0,
			hasAudioData: !!request.audioData,
			audioMimeType: request.audioMimeType,
			hasImageData: !!request.imageData,
			imageMimeType: request.imageMimeType,
			selectedFormId: request.selectedFormId,
			aiOutputLanguage: request.aiOutputLanguage, // NEW: Log the requested language
		});

		if (GEMINI_API_KEY === "YOUR_GEMINI_API_KEY" || !GEMINI_API_KEY) {
			const errorMsg = "Gemini API Key is not configured or is still the placeholder in background.js. Please replace it with your actual key.";
			console.error("BACKGROUND:", errorMsg);
			sendResponse({ error: errorMsg });
			return true;
		}

		// NEW: Destructure aiOutputLanguage from the request
		const { formsData, userRequest, audioData, audioMimeType, imageData, imageMimeType, selectedFormId, aiOutputLanguage } = request;

		const hasImage = !!(imageData && imageMimeType);
		const hasAudio = !!(audioData && audioMimeType);
		const hasText = !!(userRequest && userRequest.trim() !== "");

		if (hasImage && hasAudio && hasText) {
			const errorMsg =
				"Simultaneous image, audio, and text input is not supported. Please use image+audio, image+text, audio-only, text-only, or image-only.";
			console.warn("BACKGROUND: Disallowed input combination:", errorMsg);
			sendResponse({ error: errorMsg });
			return true;
		}

		let basePromptText;
		let apiParts = [];
		const formsJsonString = JSON.stringify(formsData || [], null, 2);

		// NEW: Dynamically create an instruction for the AI's output language
		let aiLanguageInstruction = "";
		if (aiOutputLanguage === "ar") {
			aiLanguageInstruction = `
IMPORTANT: The 'fieldValue' in your JSON response for any text-based input fields (like text, textarea, email, password) MUST be in Arabic. Do not translate the 'fieldName', only the values to be filled.
`;
		}

		const commonOutputInstructions = `
Example Output Format:
\`\`\`json
{
  "formId": "form-1",
  "fieldsToFill": [
    { "fieldName": "username", "fieldValue": "my_user" },
    { "fieldName": "password", "fieldValue": "my_password123" }
  ]
}
\`\`\`
If the input (image, audio, or text) is unclear, or no fields can be identified for the TARGET form, return the target 'formId' and an empty 'fieldsToFill' array.
Provide ONLY the JSON object as your response. Do not add any explanatory text before or after the JSON.
`;

		let targetFormInstruction = "";
		if (selectedFormId) {
			const targetForm = (formsData || []).find((f) => f.uniqueId === selectedFormId);
			if (targetForm) {
				targetFormInstruction = `
IMPORTANT: You MUST focus on filling the form with 'uniqueId': "${selectedFormId}".
This form has been explicitly selected by the user. Do NOT choose another form.
Here is the structure of the target form:
\`\`\`json
${JSON.stringify(targetForm, null, 2)}
\`\`\`
All other forms in the main list below are provided for general context only. Your primary goal is to populate fields for form "${selectedFormId}".
If the input (image, audio, or text) is unclear or does not seem to apply to THIS SPECIFIC FORM ("${selectedFormId}"), you MUST return 'formId': "${selectedFormId}" and an empty 'fieldsToFill' array.
`;
			} else {
				targetFormInstruction = `
NOTE: A specific form ID ("${selectedFormId}") was requested, but it was not found in the provided forms list. Please proceed by analyzing all forms and the user's request to choose the most appropriate one based on the input.
`;
				console.warn(`BACKGROUND: selectedFormId "${selectedFormId}" not found in formsData.`);
			}
		} else {
			targetFormInstruction = `
Based on all available information (image, forms, user request), identify which form (by its 'uniqueId' from the JSON) the data corresponds to.
If no form seems to match the input, try to pick the most plausible one (e.g., the first form) and return its 'formId' with an empty 'fieldsToFill' array.
`;
		}

		if (hasImage) {
			console.log(`BACKGROUND: Processing with IMAGE data. MIME Type: "${imageMimeType}"`);
			basePromptText = `
You are an AI assistant helping to fill web forms based on provided context which may include an image, audio, and/or text.
I will provide:
1.  A JSON array of ALL forms available on a webpage.
2.  An image (e.g., a table, client info, a picture of a form).
3.  Optionally, a user's spoken or typed request for specific instructions related to the image or forms.

Your tasks:
1.  Carefully analyze the provided forms JSON to understand the available fields for ALL forms.
${targetFormInstruction}
2.  Thoroughly analyze the provided image to extract relevant data for form filling (focusing on the target form if specified).
3.  If a user's spoken (audio) or typed (text) request is also given, use it to understand specific instructions, or how to interpret the image data for the target form.
4.  Extract the specific field names and their corresponding values for the target form.
5.  Return a single JSON object with the 'formId' of the chosen/specified form and an array 'fieldsToFill'.

Here are ALL the forms available on the page (for context):
\`\`\`json
${formsJsonString}
\`\`\`

The image to analyze is provided next.
`;
			apiParts.push({ text: basePromptText });
			apiParts.push({ inlineData: { mimeType: imageMimeType, data: imageData } });

			if (hasAudio) {
				apiParts.push({ text: "The user's spoken instructions regarding the image and forms are in the following audio. Listen carefully:" });
				apiParts.push({ inlineData: { mimeType: audioMimeType, data: audioData } });
				// NEW: Added language instruction
				apiParts.push({ text: `${aiLanguageInstruction}${commonOutputInstructions}` });
			} else if (hasText) {
				// NEW: Added language instruction
				apiParts.push({
					text: `The user's typed instructions regarding the image and forms are: "${userRequest}"\n${aiLanguageInstruction}${commonOutputInstructions}`,
				});
			} else {
				// NEW: Added language instruction
				apiParts.push({
					text: `Please analyze the image and fill the target form based on its content.\n${aiLanguageInstruction}${commonOutputInstructions}`,
				});
			}
		} else if (hasAudio) {
			console.log(`BACKGROUND: Processing with AUDIO data. MIME Type: "${audioMimeType}"`);
			basePromptText = `
You are an AI assistant helping to fill web forms.
I will provide a JSON array of ALL forms from a webpage and an audio clip of the user's request.
Your tasks:
1.  Listen to the audio to understand the user's instructions for filling a form.
2.  Analyze the provided forms JSON to understand the available fields for ALL forms.
${targetFormInstruction}
3.  Extract the specific field names and their corresponding values from the audio for the target form.
4.  Return a single JSON object with the 'formId' of the chosen/specified form and an array 'fieldsToFill'.

Here are ALL the forms available on the page (for context):
\`\`\`json
${formsJsonString}
\`\`\`

The user's spoken request is in the audio provided next. Interpret it carefully.
${aiLanguageInstruction}${commonOutputInstructions} 
`; // NEW: Injected language instruction
			apiParts.push({ text: basePromptText });
			apiParts.push({ inlineData: { mimeType: audioMimeType, data: audioData } });
		} else if (hasText) {
			console.log("BACKGROUND: Processing with TEXT data only. User request:", userRequest.substring(0, 100) + "...");
			basePromptText = `
You are an AI assistant designed to help fill out web forms.
I will provide a JSON array of ALL forms, where each form has a uniqueId.
Your task is to:
1.  Analyze the user's text request.
2.  Analyze the provided forms JSON to understand the available fields for ALL forms.
${targetFormInstruction}
3.  Return a single JSON object containing the 'formId' of the chosen/specified form and an array of 'fieldsToFill'.

Here are ALL the forms found on the page (for context):
\`\`\`json
${formsJsonString}
\`\`\`

Here is my request:
"${userRequest}"
${aiLanguageInstruction}${commonOutputInstructions}
`; // NEW: Injected language instruction
			apiParts.push({ text: basePromptText });
		} else {
			const errorMsg = "No user request (text, audio, or image) provided to background script.";
			console.error("BACKGROUND:", errorMsg);
			sendResponse({ error: errorMsg });
			return true;
		}

		const apiContents = [{ parts: apiParts }];

		console.log(
			"BACKGROUND: Preparing to call Gemini API. Model: gemini-2.5-flash. Structure of 'contents.parts':",
			JSON.stringify(apiParts, (key, value) => (typeof value === "string" && value.length > 100 ? value.substring(0, 100) + "..." : value), 2)
		);

		fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				contents: apiContents,
				generationConfig: {
					responseMimeType: "application/json",
					responseSchema: {
						type: "OBJECT",
						properties: {
							formId: { type: "STRING" },
							fieldsToFill: {
								type: "ARRAY",
								items: {
									type: "OBJECT",
									properties: {
										fieldName: { type: "STRING" },
										fieldValue: { oneOf: [{ type: "STRING" }, { type: "BOOLEAN" }, { type: "NUMBER" }] },
									},
									required: ["fieldName", "fieldValue"],
								},
							},
						},
						required: ["formId", "fieldsToFill"],
					},
				},
			}),
		})
			.then(async (response) => {
				console.log("BACKGROUND: Gemini API response status:", response.status);
				if (!response.ok) {
					const errorText = await response.text();
					console.error("BACKGROUND: Gemini API call FAILED. Status:", response.status, "Response Body:", errorText);
					let detailedMessage = `Gemini API Error (Status ${response.status}).`;
					try {
						const errorJson = JSON.parse(errorText);
						if (errorJson.error && errorJson.error.message) {
							detailedMessage += ` Message: ${errorJson.error.message}`;
						} else {
							detailedMessage += ` Raw: ${errorText.substring(0, 200)}...`;
						}
					} catch (e) {
						detailedMessage += ` Raw (not JSON): ${errorText.substring(0, 200)}...`;
					}
					throw new Error(detailedMessage);
				}
				return response.json();
			})
			.then((data) => {
				console.log("BACKGROUND: Gemini API call SUCCESS. Response data structure keys:", Object.keys(data));
				if (data.candidates && data.candidates.length > 0 && data.candidates[0].content?.parts?.[0]?.text) {
					const geminiResult = data.candidates[0].content.parts[0].text;
					console.log(
						"BACKGROUND: Extracted Gemini result text (should be JSON). Length:",
						geminiResult.length,
						"Preview:",
						geminiResult.substring(0, 200) + "..."
					);
					try {
						JSON.parse(geminiResult);
						sendResponse({ geminiResult: geminiResult });
					} catch (e) {
						const errorMsg = "Gemini response was not valid JSON, despite responseSchema.";
						console.error("BACKGROUND:", errorMsg, "Raw text:", geminiResult, "Error:", e);
						throw new Error(errorMsg + " Gemini output: " + geminiResult.substring(0, 100) + "...");
					}
				} else {
					let errorDetails = "Unknown structure issue.";
					if (data.promptFeedback && data.promptFeedback.blockReason) {
						errorDetails = `Blocked: ${data.promptFeedback.blockReason}. Details: ${JSON.stringify(data.promptFeedback.safetyRatings)}`;
					} else if (data.candidates && data.candidates.length > 0 && data.candidates[0].finishReason) {
						errorDetails = `Finish Reason: ${data.candidates[0].finishReason}. Details: ${JSON.stringify(
							data.candidates[0].safetyRatings
						)}`;
					}
					const errorMsg = `No valid content/text found in Gemini response structure (expected JSON text due to responseSchema). ${errorDetails}`;
					console.error("BACKGROUND:", errorMsg, "Full response data:", JSON.stringify(data));
					throw new Error(errorMsg + " Check background console for full response.");
				}
			})
			.catch((error) => {
				console.error("BACKGROUND: An error occurred during Gemini API call or processing:", error.message, error.stack);
				sendResponse({ error: error.message });
			});

		return true;
	}
});
