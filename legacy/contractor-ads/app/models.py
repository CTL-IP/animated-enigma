from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from .database import Base


class Ad(Base):
    __tablename__ = "ads"

    id = Column(Integer, primary_key=True, index=True)
    business_name = Column(String(200), nullable=False)
    contractor_type = Column(String(100), nullable=False)
    services = Column(Text, nullable=False)
    location = Column(String(200), nullable=False)
    phone = Column(String(50))
    website = Column(String(200))
    tagline = Column(String(500))
    ad_headline = Column(String(300))
    ad_body = Column(Text)
    ad_cta = Column(String(200))
    image_path = Column(String(500))
    platform = Column(String(50), default="facebook")
    status = Column(String(20), default="draft")
    facebook_post_id = Column(String(128))
    facebook_post_url = Column(String(500))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class FacebookPage(Base):
    """The one Page this machine is allowed to publish to."""

    __tablename__ = "facebook_pages"

    id = Column(Integer, primary_key=True)
    page_id = Column(String(64), nullable=False, unique=True)
    page_name = Column(String(200), nullable=False)
    access_token = Column(Text, nullable=False)
    connected_at = Column(DateTime(timezone=True), server_default=func.now())


class FacebookChoice(Base):
    """Pages returned by Facebook Login, kept until Patrick picks one."""

    __tablename__ = "facebook_choices"

    page_id = Column(String(64), primary_key=True)
    page_name = Column(String(200), nullable=False)
    access_token = Column(Text, nullable=False)


class OAuthState(Base):
    __tablename__ = "oauth_states"

    state = Column(String(80), primary_key=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
