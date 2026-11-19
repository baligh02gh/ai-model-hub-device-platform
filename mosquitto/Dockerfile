FROM eclipse-mosquitto:2

# Copied in at build time instead of bind-mounted from the host: bind-mounting
# a file from a Windows filesystem into this container does not reliably
# preserve the file permissions Mosquitto needs (it drops privileges to the
# "mosquitto" user, which then could not read a root-only passwd file).
COPY mosquitto.conf /mosquitto/config/mosquitto.conf
COPY passwd /mosquitto/config/passwd
RUN chown mosquitto:mosquitto /mosquitto/config/passwd && chmod 640 /mosquitto/config/passwd \
 && chmod 644 /mosquitto/config/mosquitto.conf
