import uuid
from datetime import datetime
from pydantic import BaseModel


class PaymentResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    cliente_id: uuid.UUID
    monto: float
    fecha_pago: datetime
    metodo: str
    estado: str
    created_at: datetime
