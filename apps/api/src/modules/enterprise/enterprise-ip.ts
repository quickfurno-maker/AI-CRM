import { BlockList, isIP } from 'node:net';

export function normalizeClientIp(input: string | undefined) {
  if (!input) return '';
  const value = input.trim();
  if (value.startsWith('::ffff:') && isIP(value.slice(7)) === 4) {
    return value.slice(7);
  }
  return value;
}

export function validateIpRule(rule: string) {
  const value = rule.trim();
  if (!value) throw new Error('IP rule cannot be empty.');

  const slash = value.lastIndexOf('/');
  const address = slash >= 0 ? value.slice(0, slash) : value;
  const family = isIP(address);
  if (!family) throw new Error(`Invalid IP address: ${rule}`);

  if (slash >= 0) {
    const prefix = Number(value.slice(slash + 1));
    const max = family === 4 ? 32 : 128;
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > max) {
      throw new Error(`Invalid CIDR prefix: ${rule}`);
    }
  }
  return value;
}

export function isIpAllowed(input: string, rules: string[]) {
  const ip = normalizeClientIp(input);
  const family = isIP(ip);
  if (!family) return false;

  const block = new BlockList();
  for (const raw of rules) {
    const rule = validateIpRule(raw);
    const slash = rule.lastIndexOf('/');
    const address = slash >= 0 ? rule.slice(0, slash) : rule;
    const type = isIP(address) === 4 ? 'ipv4' : 'ipv6';
    if (slash >= 0) {
      block.addSubnet(address, Number(rule.slice(slash + 1)), type);
    } else {
      block.addAddress(address, type);
    }
  }
  return block.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}
