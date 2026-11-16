# Presentación de Medicita Contigo

**Medicita Contigo: menos horas perdidas, más oportunidades de atención.**

## Problema y propuesta

Una persona puede olvidar una atención o no poder asistir. Si cancelar es difícil, un cupo puede quedar sin aprovechar mientras otra persona espera. Medicita Contigo propone un proceso claro para avisar, liberar y ofrecer el cupo con supervisión administrativa.

Es una plataforma independiente en desarrollo. No está conectada a los sistemas oficiales de agendamiento de CESFAM. El CESFAM Dr. Alfonso Leng de Providencia es un caso de estudio; su mención no implica autorización, uso de su agenda ni respaldo institucional.

## Preparación

Abrir la demostración identificada como ficticia. Utilizar **Reiniciar** y el selector **Ver como** para alternar paciente A, paciente B, administración, recepción y supervisión. No utilizar cuentas de pacientes reales ni mostrar credenciales. Las fechas se generan a partir del escenario y deben mostrarse desde la agenda, no como una promesa fija de atención.

## Guion reproducible

1. **Paciente A:** abrir Mis horas y mostrar su reserva futura. Presionar No podré asistir, elegir cancelar y confirmar. Mostrar el mensaje que aclara que la operación afecta Medicita Contigo.
2. **Administración:** abrir agenda/cancelaciones y localizar el cupo liberado. Revisar candidatos compatibles por servicio y disponibilidad; explicar el criterio administrativo de antigüedad.
3. **Administración:** enviar una oferta al paciente B. Mostrar el vencimiento y la reserva temporal del cupo, sin afirmar un envío por correo o WhatsApp.
4. **Paciente B:** abrir Notificaciones, leer la oferta y aceptarla. Mostrar la nueva reserva y comprobar que no se duplicó la asignación.
5. **Administración:** revisar historial y métrica de nueva asignación. En este momento hay una reasignación, pero el cupo todavía no se considera recuperado por atención realizada.
6. **Recepción:** usar **Fecha simulada** para avanzar al día y hora de esa reserva ficticia. Registrar la llegada mediante QR o identificación asistida autorizada; después finalizar la atención desde agenda. Mostrar que ahora el informe cuenta el cupo recuperado. El reloj simulado pertenece solo a la demostración y no modifica la hora ni las reglas del backend real.
7. **Cierre:** mostrar modo sencillo, ayuda, alternativa manual al QR y CSV agregado. La vista de supervisión no expone identidades individuales. Reiniciar la demostración si se va a repetir.

Este recorrido se ejecutó en Chromium: el informe pasó de reasignación 1/recuperación 0 a recuperación 1 después de completar la atención. Es evidencia del escenario ficticio, no de resultados clínicos ni de uso por un establecimiento.

## Qué mostrar y qué explicar

| Evidencia | Mensaje |
|---|---|
| Cancelación registrada | Avisar a tiempo permite volver a ofrecer un cupo |
| Candidatos compatibles | Compatibilidad administrativa, sin urgencia médica automatizada |
| Oferta y aceptación | La persona conserva su hora anterior hasta aceptar un cambio válido |
| Historial | Cada movimiento importante tiene un registro |
| Métricas separadas | Ocupación, confirmación y asistencia son hechos distintos |
| Aviso de simulación | Ningún indicador pertenece a un centro real |

No presentar indicadores ficticios como resultados de una investigación o impacto clínico. La propuesta se evalúa mediante un piloto autorizado y métricas bien definidas, no mediante promesas de reducción de inasistencia sin evidencia.

## Cierre propuesto

“Con una acción sencilla —avisar que no podremos asistir— un cupo puede convertirse en una nueva oportunidad. Medicita Contigo organiza ese recorrido de manera clara y trazable.”
