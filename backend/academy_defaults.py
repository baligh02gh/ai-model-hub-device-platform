"""Default Academy curriculum seeded into every new organization.

Ported from the frontend's previous hardcoded MODULES array so every
organization starts with the same baseline course, while a formateur can now
edit, add or remove modules afterwards through the /academy/modules API.
"""

DEFAULT_MODULES = [
    {
        "module_key": "edge-ai",
        "title": "What is Edge AI?",
        "minutes": 5,
        "summary": "Why running AI on a small device beats sending every image to the cloud.",
        "sections": [
            {
                "heading": "AI that runs on the device",
                "paragraphs": [
                    "Traditionally, a camera sends its images to a server in the cloud, and a model there analyses them. With Edge AI, the model runs directly on a small device next to the camera, so the analysis happens on the spot.",
                ],
            },
            {
                "heading": "Why it matters",
                "paragraphs": [
                    "Responses are faster because there is no round trip over the network. The device keeps working without a stable internet connection. And images do not have to leave the device, which is better for privacy.",
                    "The trade-off is that small devices have limited memory and processing power, so the models you deploy must be small and optimised.",
                ],
            },
            {
                "heading": "Where TRINOVATECH fits",
                "paragraphs": [
                    "This platform is the control room. It stores your AI models, tracks your devices, and helps you load a model onto a Grove Vision AI V2 camera module.",
                ],
            },
        ],
        "takeaways": [
            "Edge AI runs the model on the device, not in the cloud.",
            "Benefits: speed, offline use and privacy.",
            "Cost: small devices need small, optimised models.",
        ],
    },
    {
        "module_key": "model-package",
        "title": "Anatomy of a model package",
        "minutes": 6,
        "summary": "What is inside a model .zip, and how the platform checks it.",
        "sections": [
            {
                "heading": "A model is a ZIP file",
                "paragraphs": [
                    "Models are shared as a .zip archive that contains the model files and a description file called manifest.json.",
                ],
            },
            {
                "heading": "The manifest",
                "paragraphs": [
                    "The manifest describes the package: which hardware it is made for (target) and which version it is. The Model Hub rejects a package if the manifest is missing, is not valid JSON, or lacks a version or a target.",
                ],
                "code": '{\n  "name": "Object Detector",\n  "version": "1.0",\n  "target": "Grove Vision AI V2"\n}',
            },
            {
                "heading": "Integrity with SHA256",
                "paragraphs": [
                    "A SHA256 hash is a fingerprint of a file. If even one byte changes, the fingerprint changes completely. The Model Hub computes it when you upload a model and shows it in the table, so you can later check that the file reaching a device is exactly the one you uploaded.",
                    "The same fingerprint is also how the platform notices that you are uploading a model it already has.",
                ],
            },
        ],
        "takeaways": [
            "A model package is a .zip with a manifest.json inside.",
            "The manifest must declare a version and a target.",
            "The SHA256 hash proves a file has not been changed.",
        ],
    },
    {
        "module_key": "deploy",
        "title": "Deploying a model to a device",
        "minutes": 6,
        "summary": "How a model gets from the Model Hub onto the camera module.",
        "sections": [
            {
                "heading": "Why a local helper is needed",
                "paragraphs": [
                    "Web browsers have limited access to USB hardware. So a small program called the Edge Agent runs on your own computer (at localhost:4040). It talks to the camera module over USB, downloads the validated model from the platform, and writes it to the board.",
                ],
            },
            {
                "heading": "The four states you will see",
                "paragraphs": [
                    "Device missing: no board is detected. Plug in the module with a USB-C cable.",
                    "Wrong device: something is connected, but it is not a Grove Vision AI V2.",
                    "Transferring: the model is being downloaded and written to the board. Do not unplug it.",
                    "Success: the model is on the board and ready to use.",
                ],
            },
            {
                "heading": "If the cable is pulled mid-transfer",
                "paragraphs": [
                    "The Edge Agent reports Device missing instead of crashing. Reconnect the board and start the transfer again.",
                ],
            },
        ],
        "takeaways": [
            "The Edge Agent bridges the browser and the USB device.",
            "Four states: device missing, wrong device, transferring, success.",
            "A failed transfer is safe to retry.",
        ],
    },
    {
        "module_key": "results",
        "title": "Reading live results",
        "minutes": 5,
        "summary": "Bounding boxes, confidence scores, privacy and device health.",
        "sections": [
            {
                "heading": "What the preview shows",
                "paragraphs": [
                    "The live preview draws a rectangle (a bounding box) around each detected object, with a label and a confidence score.",
                ],
            },
            {
                "heading": "Confidence scores",
                "paragraphs": [
                    "A score of 92% means the model is quite sure, not that it is always right. Low scores are often wrong, which is why applications usually ignore detections below a chosen threshold.",
                ],
            },
            {
                "heading": "The preview stays on your computer",
                "paragraphs": [
                    "The live image goes from the camera to your own computer only. Nothing is uploaded unless you explicitly choose to send it.",
                ],
            },
            {
                "heading": "Monitoring device health",
                "paragraphs": [
                    "Devices report their battery level, Wi-Fi signal (RSSI) and temperature several times a second. RSSI is measured in dBm: the closer to 0, the stronger the signal, so -55 dBm is better than -85 dBm.",
                    "On the Devices page, a device counts as online if it reported in the last 15 seconds.",
                ],
            },
        ],
        "takeaways": [
            "Boxes, labels and confidence scores describe each detection.",
            "The preview never leaves your computer without your action.",
            "RSSI closer to 0 means a stronger Wi-Fi signal.",
        ],
    },
]
