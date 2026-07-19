/**
 * Reduce a wagmi/viem write error to a concise, user-actionable message.
 *
 * Wallet/JSON-RPC errors routinely include the full calldata hex blob (huge
 * and useless to a human) and a multi-line stack. Callers should still log
 * the raw error to the console for debugging; this helper returns only what
 * a user needs to act on:
 *
 *   - the user-rejection meaning (when that's what happened),
 *   - viem's `shortMessage` (a one-line revert reason) when present,
 *   - a trimmed first line of the message — never the giant calldata dump.
 */
export function conciseWalletError(err: unknown): string {
  const e = err as {
    code?: number | string;
    name?: string;
    shortMessage?: string;
    message?: string;
  };
  if (
    e?.code === 4001
    || e?.name === "UserRejectedRequestError"
    || /user rejected/i.test(e?.message ?? "")
  ) {
    return "Transaction rejected in wallet.";
  }
  if (e?.shortMessage) return e.shortMessage;
  const msg = (e?.message ?? String(err)).split("\n")[0].trim();
  if (!msg) return "Submission failed — see console for details.";
  return msg.length > 160 ? `${msg.slice(0, 157)}…` : msg;
}
