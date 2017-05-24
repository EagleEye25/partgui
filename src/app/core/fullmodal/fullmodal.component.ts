import { Component, Input, OnDestroy, Renderer, HostListener, ElementRef, ViewChild } from '@angular/core';

@Component({
  selector: 'fullmodal',
  templateUrl: './fullmodal.component.html',
  styleUrls: ['./fullmodal.component.scss']
})
export class FullmodalComponent implements OnDestroy {
  @ViewChild('modal') modal:ElementRef;
  @ViewChild('percentageBar') percentageBar:ElementRef;

  @Input() showCloseButton: boolean = true;
  @Input() isOpen: boolean = false;
  @Input() closeOnEscape: boolean = true;

  private hasScrollY: boolean = false;
  public syncPercentage: number = 0.00;
  private synced: boolean = false;

  constructor(private elementRef: ElementRef,
              private renderer: Renderer) {
    this.renderer.setElementClass(document.body, 'modal-open', true);
  }

  open() {
    this.isOpen = true;
    this.ngDoCheck();
  }

  close() {
    this.isOpen = false;
  }

  @HostListener('window:keydown', ['$event'])
  keyboardInput(event: any) {
    if(this.closeOnEscape && event.code.toLowerCase()=="escape")
      this.isOpen = false;
  }

  ngOnDestroy() {
    this.renderer.setElementClass(document.body, 'modal-open', false);
  }

  ngDoCheck() {
    this.renderer.setElementClass(document.body, 'modal-open', this.isOpen);

    <span *ngIf="!synced" [style.width]="syncPercentage + '%'">SYNCING PROGRESS {{ syncPercentage }}%</span>

    if (this.isOpen && this.modal) {
      let element = this.modal.nativeElement;
      let style = element.ownerDocument.defaultView.getComputedStyle(element, undefined);

      this.hasScrollY = style.overflowY === 'scroll' || (style.overflowY === 'auto' && element.clientHeight < element.scrollHeight);
    }
  }

  ngAfterViewInit() {
    this.ngDoCheck();
  }
}
