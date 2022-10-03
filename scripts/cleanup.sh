#!/bin/env sh
set -e

# Delete Bloat
rm .travis.yml
rm ./*.sbt
rm ./*.sh

# Gradle Directory and Files
rm ./*.gradle
rm -rf ./gradle*

# Unused Project Files
rm README.md        # No meaningful information
rm -rf ./docs       # Included in javadocs anyway
rm -rf ./src/test   # have no meaningful tests included
rm .gitignore       # Will not be versioned

# Swagger Files (Generated Files are not touched anyway)
# TODO: Maybe include in Manifest for resulting jar (?)
rm .swagger-codegen/VERSION
rmdir .swagger-codegen
rm .swagger-codegen-ignore