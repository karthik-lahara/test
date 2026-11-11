
from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional

from backend.services.job_service import create_job

router = APIRouter(
    prefix="/api/v1",
    tags=["Call Analysis"]
)


# Audio information
class AudioDetails(BaseModel):
    url: str = Field(..., description="Temporary S3 download URL")
    expiresAt: str = Field(..., description="S3 URL expiry time")
    mimeType: str = Field(..., description="Audio MIME type")
    sizeBytes: int = Field(..., gt=0, description="Audio file size")
    sha256: str = Field(..., description="SHA256 checksum")


# Call information
class CallDetails(BaseModel):
    direction: str = Field(..., description="incoming or outgoing")
    startedAt: str = Field(..., description="Call start time")
    durationSec: int = Field(..., ge=0, description="Call duration")


# Employee information
class EmployeeDetails(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None


# Main request body
class CallAnalysisRequest(BaseModel):
    requestId: str = Field(..., description="Unique analysis request ID")
    audio: AudioDetails
    call: CallDetails
    employee: Optional[EmployeeDetails] = None
    callbackUrl: str = Field(..., description="MERN callback endpoint")


@router.post(
    "/analyze",
    status_code=status.HTTP_202_ACCEPTED
)
async def analyze_call(
    request: CallAnalysisRequest,
    x_timestamp: str = Header(..., alias="X-Timestamp"),
    x_signature: str = Header(..., alias="X-Signature")
):

    try:
        # Convert request into dictionary
        request_data = request.model_dump(mode="json")

        # Create analysis job
        job = create_job(
            request_data=request_data
        )

        return {
            "message": "Call analysis request accepted",
            "requestId": request.requestId,
            "job_id": job["job_id"],
            "status": job["status"]
        }

    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create call analysis job"
        ) from exc
