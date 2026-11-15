FROM postgres:18-bookworm

# Only public tools and scripts enter the image. No credentials or backup data in build context.
RUN apt-get update \
    && apt-get install -y --no-install-recommends age \
    && rm -rf /var/lib/apt/lists/*
COPY backup.sh test-backup.sh /usr/local/bin/
RUN chmod 755 /usr/local/bin/backup.sh /usr/local/bin/test-backup.sh
ENTRYPOINT ["/usr/local/bin/backup.sh"]
