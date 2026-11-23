'use strict';

const express = require('express');
const { ApiError, sendOk, wrap } = require('../lib/http');
const { pageParams, optionalDate, optionalString } = require('../lib/params');
const { requireInt } = require('../lib/body');
const { authenticate } = require('../middleware/auth');
const tickets = require('../services/tickets');

const router = express.Router();
router.use(authenticate);

const TICKET_STATUSES = ['VALID', 'USED', 'REFUND_PENDING', 'VOID'];

// API-20 My tickets
router.get(
  '/',
  wrap(async (req, res) => {
    const { page, pageSize, offset } = pageParams(req.query);
    const status = optionalString(req.query.status, 'status', 30);
    if (status && !TICKET_STATUSES.includes(status)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'status is not a valid ticket status');
    }
    const dateFrom = optionalDate(req.query.date_from, 'date_from');
    const data = await tickets.listTickets({
      userId: req.auth.userId,
      status,
      dateFrom,
      page,
      pageSize,
      offset,
    });
    return sendOk(res, data);
  })
);

// API-22 QR image
router.get(
  '/:ticketId/qr.png',
  wrap(async (req, res) => {
    const ticketId = requireInt(req.params.ticketId, 'ticket_id');
    const png = await tickets.getTicketPng(ticketId, req.auth);
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    return res.send(png);
  })
);

// API-21 Ticket detail
router.get(
  '/:ticketId',
  wrap(async (req, res) => {
    const ticketId = requireInt(req.params.ticketId, 'ticket_id');
    const data = await tickets.getTicket(ticketId, req.auth);
    return sendOk(res, data);
  })
);

module.exports = router;
