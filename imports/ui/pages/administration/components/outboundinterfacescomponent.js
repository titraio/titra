import './outboundinterfacescomponent.html'
import OutboundInterfaces from '../../../../api/outboundinterfaces/outboundinterfaces'
import { showToast } from '../../../../utils/frontend_helpers'

Template.outboundinterfacescomponent.onCreated(function outboundinterfacesCreated() {
    this.subscribe('outboundinterfaces')
})
Template.outboundinterfacescomponent.helpers({
    outboundInterfaces() {
        return OutboundInterfaces.find()
    },
})
Template.outboundinterfacescomponent.events({
    'click .js-create-outbound-interface'(event, templateInstance) {
        event.preventDefault()
        Meteor.call('outboundinterfaces.insert',
            {
                name: templateInstance.$('#name').val(),
                description: templateInstance.$('#description').val(),
                processData: templateInstance.$('#processData').val(),
                active: templateInstance.$('#isActive').prop('checked'),
                faIcon: templateInstance.$('#faIcon').val(),
            }, (error) => {
                if (error) {
                    showToast(error)
                    console.error(error)
                } else {
                    templateInstance.$('#_id').val('')
                    templateInstance.$('#name').val('')
                    templateInstance.$('#description').val('')
                    templateInstance.$('#processData').val('')
                    templateInstance.$('#isActive').prop('checked', false)
            }
        })
    },
    'click .js-update-outbound-interface'(event, templateInstance) {
        event.preventDefault()
        Meteor.call('outboundinterfaces.update',
            {
                _id: templateInstance.$('#_id').val(),
                name: templateInstance.$('#name').val(),
                description: templateInstance.$('#description').val(),
                processData: templateInstance.$('#processData').val(),
                active: templateInstance.$('#isActive').prop('checked'),
                faIcon: templateInstance.$('#faIcon').val(),
            }, (error) => {
                if (error) {
                    showToast(error)
                    console.error(error)
                } else {
                    showToast(t('notifications.success'))
                    templateInstance.$('#_id').val('')
                    templateInstance.$('#name').val('')
                    templateInstance.$('#description').val('')
                    templateInstance.$('#processData').val('')
                    templateInstance.$('#isActive').prop('checked', false)
                    templateInstance.$('#faIcon').val('')
            }
        })
    },
    'click .js-edit-outbound-interface'(event, templateInstance) {
        const inboundInterface = OutboundInterfaces.findOne({ _id: templateInstance.$(event.currentTarget).data('interface-id') })
        templateInstance.$('#_id').val(inboundInterface._id)
        templateInstance.$('#faIcon').val(inboundInterface.faIcon)
        templateInstance.$('#name').val(inboundInterface.name)
        templateInstance.$('#description').val(inboundInterface.description)
        templateInstance.$('#processData').val(inboundInterface.processData)
        templateInstance.$('#isActive').prop('checked', inboundInterface.active)
        templateInstance.$('.js-update-outbound-interface').removeClass('d-none')
        templateInstance.$('.js-create-outbound-interface').addClass('d-none')
    },
    'click .js-delete-outbound-interface'(event, templateInstance) {
        event.preventDefault()
        Meteor.call('outboundinterfaces.remove', templateInstance.$(event.currentTarget).data('interface-id'), (error) => {
            if (error) {
            showToast(error)
            console.error(error)
            } else {
            showToast('notifications.success')
            }
        })
    },
})
