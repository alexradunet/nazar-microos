all: nazar.ign

nazar.ign: nazar.bu
	podman run --rm -v "$${PWD}/..:/pwd" -w /pwd/ignition \
	  quay.io/coreos/butane:release --files-dir /pwd \
	  --pretty --strict nazar.bu > nazar.ign

validate: nazar.bu
	podman run --rm -v "$${PWD}/..:/pwd" -w /pwd/ignition \
	  quay.io/coreos/butane:release --files-dir /pwd --strict nazar.bu > /dev/null

clean:
	rm -f nazar.ign

.PHONY: all validate clean
