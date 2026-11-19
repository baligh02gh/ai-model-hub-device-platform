import json
import paho.mqtt.client as mqtt
from datetime import datetime
from database import SessionLocal
import models
import os

MQTT_BROKER = os.getenv("MQTT_BROKER", "localhost")
MQTT_PORT = 1883
MQTT_TOPIC = "trinovatech/devices/+/telemetry"
MQTT_USERNAME = os.getenv("MQTT_USERNAME")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD")

def on_connect(client, userdata, flags, reason_code, properties=None):
    print(f"Connected to MQTT broker with result code {reason_code}")
    client.subscribe(MQTT_TOPIC)

def on_message(client, userdata, msg):
    print(f"Received message on topic: {msg.topic}")

    try:
        topic_parts = msg.topic.split("/")
        device_id = topic_parts[2]

        payload = json.loads(msg.payload.decode())

        db = SessionLocal()
        device = db.query(models.Device).filter(models.Device.device_id == device_id).first()

        if device:
            device.battery = payload.get("battery")
            device.rssi = payload.get("rssi")
            device.temperature = payload.get("temperature")
            device.status = "online"
            device.last_seen = datetime.utcnow()
            db.commit()
            print(f"Updated device {device_id}")
        else:
            print(f"Unknown device: {device_id}")

        db.close()

    except Exception as e:
        print(f"Error processing message: {e}")

def start_mqtt_client():
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    if MQTT_USERNAME and MQTT_PASSWORD:
        client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(MQTT_BROKER, MQTT_PORT, 60)
    client.loop_start()
    return client