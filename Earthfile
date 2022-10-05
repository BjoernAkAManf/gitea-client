VERSION 0.6

ARG GITEA_VERSION=1.17.0

swagger-create:
    FROM gitea/gitea:${GITEA_VERSION}

    ENV GITEA__security__INSTALL_LOCK=true
    ENV GITEA__database__DB_TYPE=sqlite3
    ENV GITEA__database__PATH=/data/gitea/data.db

    WORKDIR /create
    COPY scripts/download.sh .
    RUN chmod +x download.sh && ./download.sh
    SAVE ARTIFACT swagger.json

swagger-generate:
    FROM swaggerapi/swagger-codegen-cli

    WORKDIR /generate
    COPY +swagger-create/swagger.json .
    COPY +swagger-preprocess/config.json .

    RUN --entrypoint generate \
                 --ignore-file-override=. \
                 -i swagger.json \
                 -l java \
                 -o java \
                 -c config.json

    SAVE ARTIFACT java

swagger-postprocess:
    FROM busybox


    COPY scripts/cleanup.sh /

    WORKDIR /post
    COPY +swagger-generate/java .
    RUN chmod +x /cleanup.sh && /cleanup.sh
    SAVE ARTIFACT ./*

swagger-preprocess:
    # System Setup
    FROM node:18-alpine
    RUN apk add jq
    RUN npm install -g json5

    COPY scripts/config.json5 config.json5
    RUN json5 config.json5 | jq '.artifactVersion += "'${GITEA_VERSION}'"' > config.json
    SAVE ARTIFACT config.json

swagger-compile:
    FROM maven:3-eclipse-temurin-11
    WORKDIR /compile

    COPY +swagger-postprocess/pom.xml ./pom.xml
    RUN mvn -B dependency:go-offline

    COPY +swagger-postprocess/ .
    RUN mvn -B verify

    # Tests are removed, so no need for test.jar
    RUN rm target/*-tests.jar

    SAVE ARTIFACT pom.xml
    SAVE ARTIFACT target/*.jar

swagger-deploy:
    ARG MAVEN_REPOSITORY_ID
    ARG MAVEN_REPOSITORY_URL
    FROM maven:3-eclipse-temurin-11

    WORKDIR /deploy
    COPY +swagger-compile/pom.xml .
    COPY +swagger-compile/*.jar .
    COPY settings.xml .

    RUN mvn \
        deploy:deploy-file -B \
        --settings ./settings.xml \
        -DpomFile=pom.xml \
        -Dfile=gitea-api-${GITEA_VERSION}.jar \
        -DrepositoryId=${MAVEN_REPOSITORY_ID} \
        -Durl=${MAVEN_REPOSITORY_URL} \
        -Dfile=gitea-api-${GITEA_VERSION}.jar \
        -Dsources=gitea-api-${GITEA_VERSION}-sources.jar \
        -Djavadoc=gitea-api-${GITEA_VERSION}-javadoc.jar

ci-download-versions:
    FROM node:18-alpine

    COPY --if-exists versions.timeout versions.timeout
    COPY scripts/download.mjs .
    ENV CURRENT_VERSION=${GITEA_VERSION}
    RUN node download.mjs > versions.list; \
        echo $? > versions.state;

    SAVE ARTIFACT --if-exists versions.timeout AS LOCAL versions.timeout
    SAVE ARTIFACT versions.list AS LOCAL versions.list
    SAVE ARTIFACT versions.state AS LOCAL versions.state

ci-generate-settings:
    FROM busybox
    ARG MAVEN_REPOSITORY_ID
    ARG MAVEN_REPOSITORY_USER
    ARG MAVEN_REPOSITORY_PASS

    WORKDIR /tmp
    COPY scripts/maven-settings-generate.sh .
    RUN chmod +x ./maven-settings-generate.sh && ./maven-settings-generate.sh > settings.xml
    SAVE ARTIFACT settings.xml AS LOCAL ./settings.xml