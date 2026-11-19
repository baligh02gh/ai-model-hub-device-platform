import paho.mqtt.client as mqtt
import json
import os
import time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

MQTT_BROKER = "localhost"
MQTT_PORT = 1883
MQTT_USERNAME = os.getenv("MQTT_USERNAME")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD")
DEVICE_ID = "ESP32-TEST-001"
TOPIC = f"trinovatech/devices/{DEVICE_ID}/telemetry"

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
if MQTT_USERNAME and MQTT_PASSWORD:
    client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
client.connect(MQTT_BROKER, MQTT_PORT, 60)

payload = {
    "battery": 87,
    "rssi": -55,
    "temperature": 23.4
}

client.publish(TOPIC, json.dumps(payload))
print(f"Published to {TOPIC}: {payload}")

time.sleep(1)
client.disconnect()