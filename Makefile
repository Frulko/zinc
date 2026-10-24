# Zinc: the few commands a maintainer types. The engine builds with CMake (cmake -S . -B build && tools/build zinc), see AGENTS.md.
.PHONY: preflight release release-dry release-undo help

help:
	@echo "make preflight            incremental build and local T0 checks; BASE=ref selects affected tests"
	@echo "make release              interactive: checks, next version, changelog, tag, push, watch the workflow"
	@echo "make release BUMP=minor   patch | minor | major | X.Y.Z (YES=1: no questions)"
	@echo "make release-dry          shows the version and the changelog, tags nothing"
	@echo "make release-undo TAG=v0.1.2   removes a tag and its release"

preflight:
	@tools/preflight $(if $(BASE),$(BASE))

release:
	@tools/release $(if $(BUMP),--bump $(BUMP)) $(if $(YES),--yes) $(if $(NO_WATCH),--no-watch)

release-dry:
	@tools/release --dry-run $(if $(BUMP),--bump $(BUMP))

release-undo:
	@tools/release --undo $(TAG)
