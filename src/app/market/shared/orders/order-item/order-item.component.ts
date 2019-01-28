import { Component, Input, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material';

import { Bid } from '../../../../core/market/api/bid/bid.model';
import { BidService } from 'app/core/market/api/bid/bid.service';
import { ListingService } from '../../../../core/market/api/listing/listing.service';

import { ModalsHelperService } from 'app/modals/modals.module';
import { RpcStateService } from 'app/core/rpc/rpc-state/rpc-state.service';
import { SnackbarService } from '../../../../core/snackbar/snackbar.service';

import { PlaceOrderComponent } from '../../../../modals/market-place-order/place-order.component';
import { ShippingComponent } from '../../../../modals/market-shipping/shipping.component';
import { BidConfirmationModalComponent } from 'app/modals/market-bid-confirmation-modal/bid-confirmation-modal.component';

import { RejectBidComponent } from 'app/modals/reject-bid/reject-bid.component';
import { rejectMessages } from '../../../../core/util/utils';
import { ProcessingModalComponent } from 'app/modals/processing-modal/processing-modal.component';

@Component({
  selector: 'app-order-item',
  templateUrl: './order-item.component.html',
  styleUrls: ['./order-item.component.scss']
})
export class OrderItemComponent implements OnInit {

  @Input() order: Bid;
  trackNumber: string;
  country: string = '';
  selectedMessage: string;

  constructor(
    private listingService: ListingService,
    private bid: BidService,
    private rpcState: RpcStateService,

    // @TODO rename ModalsHelperService to ModalsService after modals service refactoring.
    private modals: ModalsHelperService,
    private dialog: MatDialog,
    private snackbarService: SnackbarService
  ) { }

  ngOnInit() {
    this.getItemDetails();
  }

  getItemDetails() {

    if (!this.order) {
      return;
    }
    this.country = this.order.ShippingAddress.country;
    this.listingService.get(this.order.listingItemId).subscribe(response => {
      this.order.listing = response;
    });
  }

  // Testing of all the scenarios
  order_action() {
    switch (this.order.status) {
      case 'bidding':
        // run accept command for seller
        if (this.order.type === 'sell') {
          this.callBid('accept')
        }
        break;

      case 'awaiting':
        // Escrow lock call with popup
        if (this.order.type === 'buy') {
          this.openPaymentConfirmationModal();
          // this.escrowLock();
        }
        break;

      case 'escrow':
        if (this.order.type === 'sell') {
          this.callBid('shipping');
        }
        break;

      case 'shipping':
        // escrow release call with popup
        if (this.order.type === 'buy') {
          this.callBid('escrow');
        }
        break;

      default:
        break;
    }
  }

  // @TODO: refactor method for all calls
  callBid(type: string) {
    const dialogRef = this.dialog.open(type === 'shipping' ? ShippingComponent : PlaceOrderComponent);
    dialogRef.componentInstance.type = type;
    dialogRef.componentInstance.isConfirmed.subscribe((res: any) => {
      this.trackNumber = res ? res : '';
      this.checkForWallet(type);
    });
  }

  checkForWallet(type: string) {
    this.modals.unlock({timeout: 30}, (status) => {
      this.openProcessingModal();
      this.callAction(type)
    });
  }

  callAction(type: string) {
    if (type === 'accept') {
      this.acceptBid();
    } else if (type === 'reject') {
      this.rejectBid();
    } else {
      // Escrow Release Command
      this.escrowRelease(type);
    }
  }

  acceptBid() {
    this.bid.acceptBidCommand(this.order.id).take(1).subscribe(() => {
      this.snackbarService.open(`Order accepted ${this.order.listing.title}`);
      // Reload same order without calling api
      this.order.OrderItem.status = 'AWAITING_ESCROW';
      this.order = new Bid(this.order, this.order.type);
      this.dialog.closeAll();
    }, (error) => {
      this.dialog.closeAll();
      this.snackbarService.open(`${error}`);
    });
  }

  rejectBid() {
    this.bid.rejectBidCommand(this.order.id, this.selectedMessage).take(1).subscribe(res => {
      this.snackbarService.open(`Order rejected ${this.order.listing.title}`);
      this.order.OrderItem.status = 'REJECTED';
      this.order = new Bid(this.order, this.order.type);
      this.dialog.closeAll();
    }, (error) => {
      this.dialog.closeAll();
      this.snackbarService.open(`${error}`);
    });

  }

  escrowRelease(ordStatus: string) {
    this.bid.escrowReleaseCommand(this.order.OrderItem.id, this.trackNumber).take(1).subscribe(res => {
      this.snackbarService.open(`Escrow of Order ${this.order.listing.title} has been released`);
      this.order.OrderItem.status = ordStatus === 'shipping' ? 'SHIPPING' : 'COMPLETE';
      this.order = new Bid(this.order, this.order.type)
      this.dialog.closeAll();
    }, (error) => {
      this.dialog.closeAll();
      this.snackbarService.open(`${error}`);
    });

  }

  openPaymentConfirmationModal() {
    // @TODO need to be sets trasaction fee.
    const dialogRef = this.dialog.open(BidConfirmationModalComponent);

    dialogRef.componentInstance.bidItem = this.order;
    dialogRef.componentInstance.onConfirm.subscribe(() => {
      // do other action after confirm
      this.modals.unlock({timeout: 30}, (status) => {
        this.openProcessingModal();
        this.escrowLock()
      });
    });
  }

  escrowLock() {
    // <orderItemId> <nonce> <memo> , @TODO send nonce ?
    this.bid.escrowLockCommand(this.order.OrderItem.id, null, 'Release the funds').take(1).subscribe(res => {
      this.snackbarService.open(`Payment done for order ${this.order.listing.title}`);
      this.order.OrderItem.status = 'ESCROW_LOCKED';
      this.order = new Bid(this.order, this.order.type);
      this.dialog.closeAll();
    }, (error) => {
      this.snackbarService.open(`${error}`);
    });
  }

  openRejectBidModal(): void {
    const dialogRef = this.dialog.open(RejectBidComponent, {
      disableClose: true,
      data: {selectedMessage: this.selectedMessage}
    });
    dialogRef.afterClosed().subscribe(result => {
      this.selectedMessage = result;
      if (result !== 'CANCEL') {
        this.callAction('reject');
      }
    });
  }

  checkRejectMessage() {
    if (this.order.status === 'rejected') {
      for (let k = this.order.BidDatas.length - 1; k >= 0; k--) {
        if (rejectMessages[this.order.BidDatas[k].dataValue]) {
          return rejectMessages[this.order.BidDatas[k].dataValue];
        }
      }
      return 'No information provided'
    }
  }
  
  openProcessingModal() {
      const dialog = this.dialog.open(ProcessingModalComponent, {
        disableClose: true,
        data: {
          message: 'Hang on, we are busy processing your action'
        }
      });
  }
}
