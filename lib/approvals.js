import {randomBytes} from 'node:crypto';
export class Approvals {
 constructor(now=()=>Date.now()){this.now=now;this.pending=new Map();}
 create(owner,chat,action){this.prune();if(this.pending.size>=20)throw new Error('Слишком много неподтверждённых действий');const id=randomBytes(16).toString('hex');this.pending.set(id,{owner:String(owner),chat:String(chat),action,expires:this.now()+300000});return id;}
 take(id,owner,chat){const p=this.pending.get(id);if(!p || p.owner!==String(owner) || p.chat!==String(chat) || p.expires<this.now())throw new Error('Подтверждение устарело или недоступно');this.pending.delete(id);return p.action;}
 cancel(id,owner,chat){this.take(id,owner,chat);}
 clear(){this.pending.clear();}
 prune(){for(const [id,p]of this.pending)if(p.expires<this.now())this.pending.delete(id);}
}
