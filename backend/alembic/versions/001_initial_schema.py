"""Initial schema setup including PostGIS tables

Revision ID: 001_initial_schema
Revises: None
Create Date: 2026-06-18 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import geoalchemy2


# revision identifiers, used by Alembic.
revision: str = "001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Enable PostGIS extension
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis;")

    # 2. Create jurisdictions table
    op.create_table(
        "jurisdictions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("source_type", sa.String(length=50), nullable=False, comment="'socrata' | 'manual'"),
        sa.Column("config", sa.dialects.postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("last_polled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_successful_poll_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_watermark", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("consecutive_error_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name")
    )

    # 3. Create subscribers table (featuring geometry column)
    op.create_table(
        "subscribers",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("api_key", sa.String(length=255), nullable=False),
        sa.Column("business_name", sa.String(length=255), nullable=False),
        sa.Column("business_type", sa.String(length=100), nullable=False),
        sa.Column(
            "territory",
            geoalchemy2.types.Geometry(
                geometry_type="GEOMETRY",
                srid=4326,
                from_text="ST_GeomFromEWKT",
                name="geometry"
            ),
            nullable=False
        ),
        sa.Column("filing_type_filters", sa.dialects.postgresql.ARRAY(sa.String()), nullable=False),
        sa.Column("alert_email_enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id")
    )
    op.create_index("idx_subscribers_email", "subscribers", ["email"], unique=False)

    # 4. Create filings table (featuring point geometry and unique constraints)
    op.create_table(
        "filings",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("jurisdiction_id", sa.BigInteger(), nullable=False),
        sa.Column("external_id", sa.String(length=255), nullable=False),
        sa.Column("filing_type", sa.String(length=50), nullable=False),
        sa.Column("filing_type_raw", sa.String(length=255), nullable=True),
        sa.Column("address_raw", sa.Text(), nullable=False),
        sa.Column("address_number", sa.String(length=50), nullable=True),
        sa.Column("street_name", sa.String(length=255), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("state", sa.String(length=50), nullable=True),
        sa.Column("zip_code", sa.String(length=20), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column(
            "geom",
            geoalchemy2.types.Geometry(
                geometry_type="POINT",
                srid=4326,
                from_text="ST_GeomFromEWKT",
                name="geometry"
            ),
            nullable=False
        ),
        sa.Column("matched_address", sa.Text(), nullable=False),
        sa.Column("filed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("normalized_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("raw_payload", sa.dialects.postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(["jurisdiction_id"], ["jurisdictions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("jurisdiction_id", "external_id", name="uq_filings_jurisdiction_external")
    )
    op.create_index("idx_filings_filed_at", "filings", ["filed_at"], unique=False)
    op.create_index("idx_filings_external_id", "filings", ["external_id"], unique=False)

    # 5. Create quarantined_filings table
    op.create_table(
        "quarantined_filings",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("jurisdiction_id", sa.BigInteger(), nullable=False),
        sa.Column("external_id", sa.String(length=255), nullable=True),
        sa.Column("raw_payload", sa.dialects.postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("validation_error", sa.Text(), nullable=False),
        sa.Column("quarantined_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["jurisdiction_id"], ["jurisdictions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id")
    )
    op.create_index("idx_quarantined_filings_external_id", "quarantined_filings", ["external_id"], unique=False)

    # 6. Create alerts_sent tracker table (composite primary key)
    op.create_table(
        "alerts_sent",
        sa.Column("subscriber_id", sa.BigInteger(), nullable=False),
        sa.Column("filing_id", sa.BigInteger(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["filing_id"], ["filings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subscriber_id"], ["subscribers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("subscriber_id", "filing_id")
    )


def downgrade() -> None:
    op.drop_table("alerts_sent")
    op.drop_index("idx_quarantined_filings_external_id", table_name="quarantined_filings")
    op.drop_table("quarantined_filings")
    op.drop_index("idx_filings_external_id", table_name="filings")
    op.drop_index("idx_filings_filed_at", table_name="filings")
    op.drop_table("filings")
    op.drop_index("idx_subscribers_email", table_name="subscribers")
    op.drop_table("subscribers")
    op.drop_table("jurisdictions")
