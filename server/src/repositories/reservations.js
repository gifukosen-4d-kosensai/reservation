const { apiError, duplicateConstraintMessage } = require('../errors');
const { classifyBooking } = require('../booking-policy');
/** DB制約と短い書込トランザクションで重複・定員超過を防ぎます。 */
module.exports = function createReservationRepository(db, now = Date.now) {
  function create(
    input,
    { passphraseHash, emailHash, deviceHash, emailCiphertext, reservationId },
  ) {
    let created;
    try {
      db.exec('BEGIN IMMEDIATE');
      const currentTime = now();
      const bookingType = classifyBooking(db, input.priorityCode, currentTime);
      const slot = db.prepare('SELECT * FROM slots WHERE id=? AND is_active=1').get(input.slotId);
      if (!slot) throw apiError(404, 'SLOT_NOT_FOUND', '選択した発表枠が見つかりません。');
      if (new Date(slot.start_at).getTime() <= currentTime)
        throw apiError(409, 'SLOT_CLOSED', 'この発表枠の受付は終了しています。');

      const used = Number(
        db
          .prepare(
            `SELECT COALESCE(SUM(party_size),0) AS used FROM reservations WHERE slot_id=? AND status='confirmed'`,
          )
          .get(input.slotId).used,
      );
      if (used + input.partySize > slot.capacity)
        throw apiError(
          409,
          'NOT_ENOUGH_SEATS',
          '選択した人数分の残席がありません。残席を更新して別の枠を選んでください。',
        );

      db.prepare(
        `
        INSERT INTO reservations(id,slot_id,email_ciphertext,email_hash,passphrase_hash,device_hash,party_size,booking_type,status,email_status)
        VALUES(?,?,?,?,?,?,?,?,'confirmed','pending')
      `,
      ).run(
        reservationId,
        input.slotId,
        emailCiphertext,
        emailHash,
        passphraseHash,
        deviceHash,
        input.partySize,
        bookingType,
      );
      db.exec('COMMIT');
      created = { id: reservationId, party_size: input.partySize, slot };
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch (_) {
        /* no active transaction */
      }
      const duplicate = duplicateConstraintMessage(error);
      if (duplicate) throw duplicate;
      throw error;
    }

    return created;
  }
  function findConfirmed(emailHash) {
    return db
      .prepare(
        `SELECT r.*, s.title, s.start_at, s.end_at
 FROM reservations r JOIN slots s ON s.id=r.slot_id
 WHERE r.email_hash=? AND r.status='confirmed' LIMIT 1`,
      )
      .get(emailHash);
  }
  function cancel(id) {
    const changed = db
      .prepare(
        `UPDATE reservations SET status='cancelled', cancelled_at=CURRENT_TIMESTAMP,
 updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='confirmed'`,
      )
      .run(id);
    if (!changed.changes)
      throw apiError(409, 'ALREADY_CANCELLED', 'この予約はすでにキャンセルされています。');
  }
  function setEmailStatus(id, status) {
    db.prepare(
      'UPDATE reservations SET email_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
    ).run(status, id);
  }
  return { create, findConfirmed, cancel, setEmailStatus };
};

