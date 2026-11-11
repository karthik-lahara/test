
from uuid import uuid4
from datetime import datetime, timezone

# Temporary in-memory storage for API testing
jobs = {}


def create_job(request_data: dict):
    job_id = str(uuid4())

    job = {
        "job_id": job_id,
        "requestId": request_data["requestId"],
        "audio": request_data["audio"],
        "call": request_data["call"],
        "employee": request_data.get("employee"),
        "callbackUrl": request_data["callbackUrl"],
        "status": "accepted",
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    jobs[job_id] = job

    return job


def get_job(job_id: str):
    return jobs.get(job_id)
