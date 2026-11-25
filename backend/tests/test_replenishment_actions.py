
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from fastapi import HTTPException

from app.api.v1.endpoints.replenishment import (
    ReplenishmentActionConfirmRequest,
    confirm_tracking_action,
    confirm_replenishment_receipt,
)
from app.schemas.schemas import ReplenishmentReceive


class TestReplenishmentActions(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        self.company_id = uuid4()
        self.user_id = uuid4()
        self.followup_id = uuid4()
        self.product_id = uuid4()

        self.user = {
            "company_id": self.company_id,
            "user_id": self.user_id,
        }

        self.db = MagicMock()
        self.db.scalar = AsyncMock()
        self.db.flush = AsyncMock()
        self.db.refresh = AsyncMock()
        self.db.add = MagicMock()

    def make_followup(self, status="pendiente"):
        return SimpleNamespace(
            id=self.followup_id,
            company_id=self.company_id,
            product_id=self.product_id,
            status=status,
            planned_units=32,
            received_units=0,
            notes=None,
            updated_at=None,
            received_at=None,
            confirmed_by=None,
        )

    async def test_confirmar_cambio_valido(self):
        followup = self.make_followup()
        self.db.scalar.return_value = followup

        request = ReplenishmentActionConfirmRequest(
            followup_id=self.followup_id,
            expected_status="pendiente",
            proposed_status="pospuesto",
            confirmed=True,
            notes="Entrega aplazada",
        )

        result = await confirm_tracking_action(
            request=request,
            db=self.db,
            user=self.user,
        )

        self.assertEqual(result.status, "pospuesto")
        self.assertEqual(result.notes, "Entrega aplazada")
        self.db.flush.assert_awaited_once()

    async def test_rechazar_propuesta_desactualizada(self):
        followup = self.make_followup()
        self.db.scalar.return_value = followup

        request = ReplenishmentActionConfirmRequest(
            followup_id=self.followup_id,
            expected_status="recibido",
            proposed_status="pospuesto",
            confirmed=True,
        )

        with self.assertRaises(HTTPException) as error:
            await confirm_tracking_action(
                request=request,
                db=self.db,
                user=self.user,
            )

        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(followup.status, "pendiente")
        self.db.flush.assert_not_awaited()

    async def test_rechazar_transicion_no_permitida(self):
        followup = self.make_followup(status="descartado")
        self.db.scalar.return_value = followup

        request = ReplenishmentActionConfirmRequest(
            followup_id=self.followup_id,
            expected_status="descartado",
            proposed_status="pendiente",
            confirmed=True,
        )

        with self.assertRaises(HTTPException) as error:
            await confirm_tracking_action(
                request=request,
                db=self.db,
                user=self.user,
            )

        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(followup.status, "descartado")

    async def test_recepcion_exitosa_simulada(self):
        followup = self.make_followup()

        product = SimpleNamespace(
            id=self.product_id,
            company_id=self.company_id,
            stock=50,
            updated_at=None,
        )

        self.db.scalar.side_effect = [followup, product]

        request = ReplenishmentReceive(
            received_units=32,
            confirmed=True,
            notes="Recepción de prueba",
        )

        result = await confirm_replenishment_receipt(
            followup_id=self.followup_id,
            data=request,
            db=self.db,
            user=self.user,
        )

        self.assertEqual(product.stock, 82)
        self.assertEqual(result.status, "recibido")
        self.assertEqual(result.received_units, 32)

        self.db.add.assert_called_once()

        movement = self.db.add.call_args.args[0]

        self.assertEqual(movement.quantity, 32)
        self.assertEqual(movement.stock_before, 50)
        self.assertEqual(movement.stock_after, 82)
        self.assertEqual(movement.type, "in")

        self.db.flush.assert_awaited_once()

    async def test_rechazar_recepcion_duplicada(self):
        followup = self.make_followup(status="recibido")
        followup.received_units = 32

        self.db.scalar.return_value = followup

        request = ReplenishmentReceive(
            received_units=32,
            confirmed=True,
        )

        with self.assertRaises(HTTPException) as error:
            await confirm_replenishment_receipt(
                followup_id=self.followup_id,
                data=request,
                db=self.db,
                user=self.user,
            )

        self.assertEqual(error.exception.status_code, 409)
        self.db.add.assert_not_called()
        self.db.flush.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
