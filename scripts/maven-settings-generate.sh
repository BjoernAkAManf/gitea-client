#!/bin/env sh
set -e

if [ "${MAVEN_REPOSITORY_ID}" == "" ]; then
  echo >&2 "Specify MAVEN_REPOSITORY_ID environment variable!"
  exit 1
fi

if [ "${MAVEN_REPOSITORY_USER}" == "" ]; then
  echo >&2 "Specify MAVEN_REPOSITORY_USER environment variable!"
  exit 2
fi

if [ "${MAVEN_REPOSITORY_PASS}" == "" ]; then
  echo >&2 "Specify MAVEN_REPOSITORY_PASS environment variable!"
  exit 3
fi

cat <<EOF
<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.0.0 https://maven.apache.org/xsd/settings-1.0.0.xsd">
    <servers>
        <server>
EOF

echo '            <id>'"${MAVEN_REPOSITORY_ID}"'</id>'
echo '            <username>'"${MAVEN_REPOSITORY_USER}"'</username>'
echo '            <password>'"${MAVEN_REPOSITORY_PASS}"'</password>'

cat <<EOF
        </server>
    </servers>
</settings>
EOF
