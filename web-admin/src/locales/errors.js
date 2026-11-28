// The API keeps its stable codes and English diagnostic messages for all clients.
const byCode = {
  INVENTORY_INCONSISTENT: ['订单与座位归属不一致，操作已回滚，请联系管理员核查。','訂單與座位歸屬不一致，操作已回滾，請聯絡管理員核查。'],
  TICKET_QR_EXPIRED: ['票码已过期，请刷新电子票后重试。','票碼已過期，請重新整理電子票後再試。'],
  CHECKIN_CONFLICT: ['门票状态已变化，请重新核验。','門票狀態已變更，請重新核驗。'],
  REFUND_IN_PROGRESS: ['这笔付款已有退款正在处理，请刷新记录。', '這筆付款已有退款正在處理，請重新整理紀錄。'],
  REFUND_RETRY_NOT_ALLOWED: ['只有失败的异常付款退款可以重试。', '只有失敗的異常付款退款可以重試。'],
  REFUND_LIMIT_EXCEEDED: ['这笔付款已退款，或重试会超过原付款金额。', '這筆付款已退款，或重試會超過原付款金額。'],
  INVALID_CREDENTIALS: ['账号或密码有误。', '帳號或密碼有誤。'],
  UNAUTHORIZED: ['登录已失效，请重新登录。', '登入已失效，請重新登入。'],
  FORBIDDEN: ['此账号没有执行此操作的权限。', '此帳號沒有執行此操作的權限。'],
  NOT_FOUND: ['找不到这条记录，请刷新后重试。', '找不到這項記錄，請重新整理後再試。'],
  VALIDATION_ERROR: ['请检查填写的内容。', '請檢查填寫的內容。'],
  ROLE_ALREADY_ASSIGNED: ['此角色已经授予该账号。', '此角色已經授予該帳號。'],
  LAST_ADMIN: ['至少需要保留一名管理员。', '至少需要保留一名管理員。'],
  IDEMPOTENCY_CONFLICT: ['此操作已经提交，请刷新后查看结果。', '此操作已經提交，請重新整理後查看結果。'],
  OUT_OF_WINDOW: ['当前时间不在此场次的验票时段内。', '目前時間不在此場次的驗票時段內。'],
  WRONG_PERFORMANCE: ['此票不属于所选场次。', '此票不屬於所選場次。'],
  TICKET_INVALID: ['票码无效或已过期。', '票碼無效或已過期。'],
  TICKET_ALREADY_USED: ['此票已经核销。', '此票已經核銷。'],
  PERFORMANCE_LOCKED: ['此场次的发布或订单状态已锁定这些设置。', '此場次的發佈或訂單狀態已鎖定這些設定。'],
  SEAT_NOT_EDITABLE: ['已预留或已售出的座位无法封锁或恢复。', '已預留或已售出的座位無法封鎖或恢復。'],
  SEAT_UNAVAILABLE: ['所选座位已不可用，请刷新座位图。', '所選座位已不可用，請重新整理座位圖。'],
  REFUND_ALREADY_RESOLVED: ['此退款已有处理结果。', '此退款已有處理結果。'],
  REFUND_NOT_ALLOWED: ['此订单当前不符合退款条件。', '此訂單目前不符合退款條件。'],
  PAYMENT_MISMATCH: ['支付记录与订单不符。', '付款記錄與訂單不符。'],
  SALE_CLOSED: ['此场次已停止售票。', '此場次已停止售票。'],
  INTERNAL: ['票务服务出错，请稍后重试。', '票務服務出錯，請稍後再試。'],
};
const byMessage = {
  'Sales must start before they end': ['售票开始时间必须早于结束时间。', '售票開始時間必須早於結束時間。'],
  'Sales must end before the performance starts': ['售票必须在演出开始前结束。', '售票必須在演出開始前結束。'],
  'Check-in must start before it ends': ['验票开始时间必须早于结束时间。', '驗票開始時間必須早於結束時間。'],
  'At least one price tier is required before publishing': ['发布前请至少设置一个票价档。', '發佈前請至少設定一個票價級別。'],
  'Price tier names must be unique': ['票价档名称不能重复。', '票價級別名稱不能重複。'],
  'Seats must be initialized before publishing': ['发布前请先设置座位。', '發佈前請先設定座位。'],
  'The venue has no seats': ['这个场馆还没有设置座位。', '這個場館尚未設定座位。'],
  'No seats in this region': ['此区域没有座位。', '此區域沒有座位。'],
  'Only PUBLISHED performances can be paused': ['只有已发布的场次才可暂停售票。', '只有已發佈的場次才可暫停售票。'],
  'Only SALES_PAUSED performances can be resumed': ['只有已暂停售票的场次才可恢复售票。', '只有已暫停售票的場次才可恢復售票。'],
  'Sales have closed; the performance cannot be resumed': ['售票时段已结束，无法恢复售票。', '售票時段已結束，無法恢復售票。'],
  'Sales and check-in windows cannot be changed after orders exist': ['已有订单，无法调整售票和验票时段。', '已有訂單，無法調整售票和驗票時段。'],
  'Venue and start time cannot be changed after publishing': ['发布后无法更改场馆和开演时间。', '發佈後無法更改場館及開演時間。'],
  'CHECKER requires performance_id': ['请为验票员选择一个场次。', '請為驗票員選擇一個場次。'],
  'date_from must not be later than date_to': ['开始日期须早于或等于结束日期。', '開始日期須早於或等於結束日期。'],
  'ticket_code is required': ['请输入票码。', '請輸入票碼。'],
};
const fields = {
  title: ['活动名称','活動名稱'], organizer_name: ['主办方','主辦方'], description: ['简介','簡介'],
  user_name: ['账号','帳號'], password: ['密码','密碼'], starts_at: ['开演时间','開演時間'],
  sale_start_at: ['售票开始时间','售票開始時間'], sale_end_at: ['售票结束时间','售票結束時間'],
  checkin_start_at: ['验票开始时间','驗票開始時間'], checkin_end_at: ['验票结束时间','驗票結束時間'],
  venue_id: ['场馆','場館'], event_id: ['活动','活動'], performance_id: ['场次','場次'],
  tier_name: ['票价档名称','票價級別名稱'], current_price: ['票价','票價'], price_tiers: ['票价档','票價級別'],
  tiers: ['票价档','票價級別'], role: ['角色','角色'], status: ['状态','狀態'],
};

function validation(message, index) {
  const match = /^(\w+)(?:: | )(.+)$/.exec(message);
  if (!match || !fields[match[1]]) return '';
  const label = fields[match[1]][index], reason = match[2];
  if (reason === 'required') return index ? '請填寫' + label + '。' : '请填写' + label + '。';
  const range = /(?:length must be|must be an integer) between (\d+) and (\d+)/.exec(reason);
  if (range) {
    const unit = reason.startsWith('length') ? ['个字符','個字元'][index] : '';
    return label + ['应为 ','須為 '][index] + range[1] + '–' + range[2] + unit + '。';
  }
  return index ? '請檢查「' + label + '」。' : '请检查“' + label + '”。';
}

export function errorText(error, column) {
  if (!error) return '';
  const message = typeof error === 'string' ? error : error.message || '';
  if (!column) return message || 'The request could not be completed.';
  const i = column - 1;
  const detail = message.includes(': ') ? message.slice(message.indexOf(': ') + 2) : message;
  if (byMessage[detail]) return byMessage[detail][i];
  if (error.code === 'VALIDATION_ERROR') {
    const result = validation(message, i);
    if (result) return result;
  }
  if (byCode[error.code]) return byCode[error.code][i];
  if (error instanceof TypeError || /failed to fetch|networkerror/i.test(message)) {
    return ['无法连接票务服务，请检查连接后重试。','無法連接票務服務，請檢查連線後再試。'][i];
  }
  return ['请求未完成，请重试。','請求未完成，請再試。'][i];
}
