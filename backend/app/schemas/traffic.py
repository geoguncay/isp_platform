import uuid
from datetime import datetime
from pydantic import BaseModel


class MonthlyTraffic(BaseModel):
    mes: str
    consumo_down_gb: float
    consumo_up_gb: float


class TrafficResponse(BaseModel):
    cliente_id: uuid.UUID
    history: list[MonthlyTraffic]


class TrafficDataPoint(BaseModel):
    timestamp: datetime
    rx_rate: float  # bps
    tx_rate: float  # bps
    rx_bytes: int
    tx_bytes: int


class ClientTrafficHistory(BaseModel):
    cliente_id: uuid.UUID
    range: str
    samples: list[TrafficDataPoint]
