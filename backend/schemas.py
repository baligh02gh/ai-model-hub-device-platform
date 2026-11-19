from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, EmailStr, Field, model_validator


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    organization_name: Optional[str] = Field(default=None, min_length=2, max_length=60)
    invite_code: Optional[str] = Field(default=None, min_length=4, max_length=32)

    @model_validator(mode="after")
    def exactly_one_of_org_or_code(self):
        if bool(self.organization_name) == bool(self.invite_code):
            raise ValueError("Provide either organization_name or invite_code")
        return self


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class MemberResponse(BaseModel):
    id: int
    email: str
    role: str

    class Config:
        from_attributes = True


class RoleUpdate(BaseModel):
    role: Literal["user", "formateur"]


class AcademyProgressResponse(BaseModel):
    completed_modules: list[str]


class AcademySectionSchema(BaseModel):
    heading: str
    paragraphs: list[str]
    code: Optional[str] = None


class AcademyModuleCreate(BaseModel):
    module_key: str = Field(min_length=1, max_length=60)
    title: str = Field(min_length=1, max_length=120)
    minutes: int = Field(ge=1, le=120)
    summary: str = Field(min_length=1, max_length=300)
    sections: list[AcademySectionSchema] = Field(min_length=1)
    takeaways: list[str] = Field(min_length=1)


class AcademyModuleResponse(BaseModel):
    id: int
    module_key: str
    title: str
    minutes: int
    summary: str
    sections: list[AcademySectionSchema]
    takeaways: list[str]
    position: int


class DeviceCreate(BaseModel):
    device_id: str
    name: Optional[str] = None


class DeviceResponse(BaseModel):
    id: int
    device_id: str
    name: Optional[str]
    status: str
    battery: Optional[float]
    rssi: Optional[int]
    temperature: Optional[float]
    last_seen: Optional[datetime] = None

    class Config:
        from_attributes = True