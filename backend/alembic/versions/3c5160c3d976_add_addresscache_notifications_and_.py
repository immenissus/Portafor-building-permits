"""Add AddressCache, Notifications, and Idempotent Filing

Revision ID: 3c5160c3d976
Revises: 001_initial_schema
Create Date: 2026-06-19 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '3c5160c3d976'
down_revision: Union[str, None] = '001_initial_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Create address_cache table ---
    op.create_table('address_cache',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('address_hash', sa.String(length=64), nullable=False),
        sa.Column('address_string', sa.Text(), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('matched_address', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_address_cache_address_hash'), 'address_cache', ['address_hash'], unique=True)

    # --- Create notifications table ---
    op.create_table('notifications',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('subscriber_id', sa.BigInteger(), nullable=False),
        sa.Column('filing_id', sa.BigInteger(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['filing_id'], ['filings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['subscriber_id'], ['subscribers.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_notifications_filing_id'), 'notifications', ['filing_id'], unique=False)
    op.create_index(op.f('ix_notifications_status'), 'notifications', ['status'], unique=False)
    op.create_index(op.f('ix_notifications_subscriber_id'), 'notifications', ['subscriber_id'], unique=False)

    # --- Add Idempotency constraint to filings ---
    op.create_unique_constraint('uq_filings_jurisdiction_external', 'filings', ['jurisdiction_id', 'external_id'])


def downgrade() -> None:
    op.drop_constraint('uq_filings_jurisdiction_external', 'filings', type_='unique')
    
    op.drop_index(op.f('ix_notifications_subscriber_id'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_status'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_filing_id'), table_name='notifications')
    op.drop_table('notifications')
    
    op.drop_index(op.f('ix_address_cache_address_hash'), table_name='address_cache')
    op.drop_table('address_cache')
