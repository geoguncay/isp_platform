import uuid
from pydantic import BaseModel


class MonthlyTraffic(BaseModel):
    mes: str
    consumo_down_gb: float
    consumo_up_gb: float


class TrafficResponse(BaseModel):
    cliente_id: uuid.UUID
    history: list[MonthlyTraffic]
