# ERI: Engine for Reinert Insights — single-container build.
# Stage 1 exports the Next.js UI; stage 2 is the FastAPI runtime serving both.

FROM node:20-alpine AS ui
WORKDIR /ui
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /srv
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=ui /ui/out ./ui
ENV IRAMUTEQ_DB=/data/eri.db \
    ERI_UI_DIR=/srv/ui
VOLUME /data
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
